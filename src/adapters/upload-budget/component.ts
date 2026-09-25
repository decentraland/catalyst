import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { UploadBudgetExceededError } from './errors'
import { IUploadBudget, UploadBudgetKind, UploadBudgetLease } from './types'

const CAPACITY_SETTING: Record<UploadBudgetKind, keyof typeof EnvironmentConfig> = {
  disk: 'MAX_IN_FLIGHT_UPLOAD_BYTES',
  memory: 'MAX_IN_MEMORY_DEPLOYMENT_BYTES'
}

// Disk charged per spooled file on top of its bytes (block rounding, directory entry, inode), so the byte
// budget also caps in-flight files at one per 16 KiB: ext4's default inode ratio for a volume of that size.
export const SPOOL_FILE_OVERHEAD_BYTES = 16 * 1024

/**
 * Creates a byte and concurrency budget shared by every POST /entities request of this process: `disk`
 * bounds bodies spooled to temporary files, each file charged SPOOL_FILE_OVERHEAD_BYTES on top of its
 * size, and `memory` bounds regular deployments read into memory.
 * @param components Environment and metrics.
 * @param kind Which resource the budget bounds.
 * @returns The upload budget.
 * @throws Error when the byte budget cannot fit a single maximum-size request.
 */
export function createUploadBudget(
  components: Pick<AppComponents, 'env' | 'metrics'>,
  kind: UploadBudgetKind
): IUploadBudget {
  const { env, metrics } = components
  const setting = CAPACITY_SETTING[kind]
  const capacityBytes = env.getConfig<number>(EnvironmentConfig[setting])
  const maxUploads = env.getConfig<number>(EnvironmentConfig.MAX_CONCURRENT_UPLOADS)
  const maxTotalSize = env.getConfig<number>(EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE)
  if (kind === 'disk') {
    const maxFiles = env.getConfig<number>(EnvironmentConfig.MAX_UPLOAD_FILE_COUNT)
    const maxRequestBytes = maxTotalSize + maxFiles * SPOOL_FILE_OVERHEAD_BYTES
    if (capacityBytes < maxRequestBytes) {
      throw new Error(
        `${setting} (${capacityBytes}) must be at least MAX_UPLOAD_TOTAL_SIZE plus ${SPOOL_FILE_OVERHEAD_BYTES} ` +
          `bytes per MAX_UPLOAD_FILE_COUNT file (${maxRequestBytes}).`
      )
    }
  } else if (capacityBytes < maxTotalSize) {
    throw new Error(`${setting} (${capacityBytes}) must be at least MAX_UPLOAD_TOTAL_SIZE (${maxTotalSize}).`)
  }

  let reservedBytes = 0
  let activeUploads = 0

  function report(): void {
    metrics.observe('dcl_multipart_upload_reserved_bytes', { budget: kind }, reservedBytes)
    metrics.observe('dcl_multipart_upload_active', { budget: kind }, activeUploads)
  }

  function reject(reason: 'bytes' | 'concurrency'): never {
    metrics.increment('dcl_multipart_upload_rejections_total', { budget: kind, reason })
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
          metrics.increment('dcl_multipart_upload_rejections_total', { budget: kind, reason: 'bytes' })
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
