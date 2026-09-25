import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { UploadBudgetExceededError } from './errors'
import { IUploadBudget, UploadBudgetLease } from './types'

/**
 * Peak memory of a buffered upload whose files and fields total `bodyBytes`: the received bytes, plus
 * the copy of the one file being joined into a single buffer when it ends.
 * @param bodyBytes Bytes of the upload's files and fields.
 * @param maxFileBytes Largest file the upload may carry, if bounded.
 * @returns The bytes to reserve for the upload.
 */
export function peakUploadBytes(bodyBytes: number, maxFileBytes?: number): number {
  return bodyBytes + Math.min(bodyBytes, maxFileBytes ?? bodyBytes)
}

/**
 * Creates the in-flight upload budget shared by every POST /entities request of this process.
 * @param components Environment and metrics.
 * @returns The upload budget.
 * @throws Error when the byte budget cannot fit the peak of a single maximum-size request.
 */
export function createUploadBudget(components: Pick<AppComponents, 'env' | 'metrics'>): IUploadBudget {
  const { env, metrics } = components
  const capacityBytes = env.getConfig<number>(EnvironmentConfig.MAX_IN_FLIGHT_UPLOAD_BYTES)
  const maxUploads = env.getConfig<number>(EnvironmentConfig.MAX_CONCURRENT_UPLOADS)
  const maxRequestBytes = env.getConfig<number>(EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE)
  const maxFileBytes = env.getConfig<number | undefined>(EnvironmentConfig.MAX_UPLOAD_FILE_SIZE)
  const maxRequestPeakBytes = peakUploadBytes(maxRequestBytes, maxFileBytes)
  if (capacityBytes < maxRequestPeakBytes) {
    throw new Error(
      `MAX_IN_FLIGHT_UPLOAD_BYTES (${capacityBytes}) must fit one maximum-size upload: MAX_UPLOAD_TOTAL_SIZE plus up to MAX_UPLOAD_FILE_SIZE (${maxRequestPeakBytes}).`
    )
  }

  let reservedBytes = 0
  let activeUploads = 0

  function report(): void {
    metrics.observe('dcl_multipart_upload_reserved_bytes', {}, reservedBytes)
    metrics.observe('dcl_multipart_upload_active', {}, activeUploads)
  }

  function reject(reason: 'bytes' | 'concurrency'): never {
    metrics.increment('dcl_multipart_upload_rejections_total', { reason })
    throw new UploadBudgetExceededError(reason)
  }

  function acquire(bytes: number): UploadBudgetLease {
    if (activeUploads >= maxUploads) {
      reject('concurrency')
    }
    if (reservedBytes + bytes > capacityBytes) {
      reject('bytes')
    }
    activeUploads++
    reservedBytes += bytes
    report()

    let current = bytes
    let released = false
    return {
      resize(next: number): boolean {
        if (released) {
          return false
        }
        if (next > current && reservedBytes + next - current > capacityBytes) {
          metrics.increment('dcl_multipart_upload_rejections_total', { reason: 'bytes' })
          return false
        }
        reservedBytes += next - current
        current = next
        report()
        return true
      },
      release(): void {
        if (released) {
          return
        }
        released = true
        reservedBytes -= current
        activeUploads--
        report()
      }
    }
  }

  return { acquire }
}
