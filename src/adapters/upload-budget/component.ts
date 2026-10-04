import { DEFAULT_MAX_IN_FLIGHT_UPLOAD_BYTES, EnvironmentConfig } from '../../Environment'
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
 * Creates a byte budget shared by every POST /entities request of this process: `disk` bounds bodies
 * spooled to temporary files, each file charged SPOOL_FILE_OVERHEAD_BYTES on top of its size and every
 * lease holding at least MIN_UPLOAD_RESERVATION_BYTES, so it also bounds how many uploads run at once;
 * `memory` bounds regular deployments and entity files read into memory. Unset, the disk budget defaults
 * to DEFAULT_MAX_IN_FLIGHT_UPLOAD_BYTES or one maximum-size request, whichever is larger.
 * @param components Environment and metrics.
 * @param kind Which resource the budget bounds.
 * @returns The upload budget.
 * @throws Error when the byte budget cannot fit a single maximum-size request, or one minimum reservation.
 */
export function createUploadBudget(
  components: Pick<AppComponents, 'env' | 'metrics'>,
  kind: UploadBudgetKind
): IUploadBudget {
  const { env, metrics } = components
  const setting = CAPACITY_SETTING[kind]
  // Only request (disk) leases carry per-request overhead; memory leases hold exactly what they read.
  const minReservationBytes =
    kind === 'disk' ? env.getConfig<number>(EnvironmentConfig.MIN_UPLOAD_RESERVATION_BYTES) : 0
  const maxTotalSize = env.getConfig<number>(EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE)
  let capacityBytes: number
  if (kind === 'disk') {
    const maxFiles = env.getConfig<number>(EnvironmentConfig.MAX_UPLOAD_FILE_COUNT)
    const maxRequestBytes = maxTotalSize + maxFiles * SPOOL_FILE_OVERHEAD_BYTES
    capacityBytes =
      env.getConfig<number | undefined>(EnvironmentConfig[setting]) ??
      Math.max(DEFAULT_MAX_IN_FLIGHT_UPLOAD_BYTES, maxRequestBytes)
    if (capacityBytes < maxRequestBytes) {
      throw new Error(
        `${setting} (${capacityBytes}) must be at least MAX_UPLOAD_TOTAL_SIZE plus ${SPOOL_FILE_OVERHEAD_BYTES} ` +
          `bytes per MAX_UPLOAD_FILE_COUNT file (${maxRequestBytes}).`
      )
    }
  } else {
    capacityBytes = env.getConfig<number>(EnvironmentConfig[setting])
    if (capacityBytes < maxTotalSize) {
      throw new Error(`${setting} (${capacityBytes}) must be at least MAX_UPLOAD_TOTAL_SIZE (${maxTotalSize}).`)
    }
  }
  if (capacityBytes < minReservationBytes) {
    throw new Error(
      `${setting} (${capacityBytes}) must be at least MIN_UPLOAD_RESERVATION_BYTES (${minReservationBytes}).`
    )
  }

  let reservedBytes = 0
  let activeUploads = 0
  metrics.observe('dcl_upload_budget_capacity_bytes', { budget: kind }, capacityBytes)

  function report(): void {
    metrics.observe('dcl_upload_budget_reserved_bytes', { budget: kind }, reservedBytes)
    metrics.observe('dcl_upload_budget_active', { budget: kind }, activeUploads)
  }

  function acquire(requestedBytes: number): UploadBudgetLease {
    const bytes = Math.max(requestedBytes, minReservationBytes)
    if (reservedBytes + bytes > capacityBytes) {
      metrics.increment('dcl_upload_budget_rejections_total', { budget: kind, reason: 'bytes' })
      throw new UploadBudgetExceededError()
    }
    activeUploads++
    reservedBytes += bytes
    report()

    let current = bytes
    let released = false
    return {
      resize(requestedNext: number): boolean {
        if (released) {
          return false
        }
        const next = Math.max(requestedNext, minReservationBytes)
        if (next > current && reservedBytes + next - current > capacityBytes) {
          metrics.increment('dcl_upload_budget_rejections_total', { budget: kind, reason: 'bytes' })
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

  return { capacityBytes, acquire }
}
