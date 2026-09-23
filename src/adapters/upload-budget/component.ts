import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { UploadBudgetExceededError } from './errors'
import { IUploadBudget, UploadBudgetLease } from './types'

/**
 * Creates the in-flight upload budget shared by every POST /entities request of this process.
 * @param components Environment and metrics.
 * @returns The upload budget.
 * @throws Error when the byte budget cannot fit a single maximum-size request.
 */
export function createUploadBudget(components: Pick<AppComponents, 'env' | 'metrics'>): IUploadBudget {
  const { env, metrics } = components
  const capacityBytes = env.getConfig<number>(EnvironmentConfig.MAX_IN_FLIGHT_UPLOAD_BYTES)
  const maxUploads = env.getConfig<number>(EnvironmentConfig.MAX_CONCURRENT_UPLOADS)
  const maxRequestBytes = env.getConfig<number>(EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE)
  if (capacityBytes < maxRequestBytes) {
    throw new Error(
      `MAX_IN_FLIGHT_UPLOAD_BYTES (${capacityBytes}) must be at least MAX_UPLOAD_TOTAL_SIZE (${maxRequestBytes}).`
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
