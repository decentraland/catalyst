import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { SourceUploadLimitExceededError } from './errors'
import { ISourceUploadLimits, SourceUploadLease } from './types'

/**
 * Creates the per-source in-flight upload limits of this process. They bound this process's memory,
 * so they are process-local by design.
 * @param components Environment and metrics.
 * @returns The per-source upload limits.
 * @throws Error when the per-source byte share cannot fit one maximum-size request.
 */
export function createSourceUploadLimits(components: Pick<AppComponents, 'env' | 'metrics'>): ISourceUploadLimits {
  const { env, metrics } = components
  const maxUploads = env.getConfig<number>(EnvironmentConfig.MAX_CONCURRENT_UPLOADS_PER_SOURCE)
  const maxRequestBytes = env.getConfig<number>(EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE)
  const maxBytes =
    env.getConfig<number | undefined>(EnvironmentConfig.MAX_IN_FLIGHT_UPLOAD_BYTES_PER_SOURCE) ?? maxRequestBytes
  if (maxBytes < maxRequestBytes) {
    throw new Error(
      `MAX_IN_FLIGHT_UPLOAD_BYTES_PER_SOURCE (${maxBytes}) must fit one maximum-size upload: MAX_UPLOAD_TOTAL_SIZE (${maxRequestBytes}).`
    )
  }

  // Only sources with an upload in flight have an entry.
  const inFlight = new Map<string, { uploads: number; bytes: number }>()

  function reject(reason: SourceUploadLimitExceededError['reason']): never {
    metrics.increment('dcl_multipart_upload_rejections_total', { budget: 'source', reason })
    throw new SourceUploadLimitExceededError(reason)
  }

  function acquire(source: string, bytes: number): SourceUploadLease {
    const current = inFlight.get(source) ?? { uploads: 0, bytes: 0 }
    if (current.uploads >= maxUploads) {
      reject('source_concurrency')
    }
    if (current.bytes + bytes > maxBytes) {
      reject('source_bytes')
    }
    current.uploads++
    current.bytes += bytes
    inFlight.set(source, current)

    let released = false
    return {
      release(): void {
        if (released) {
          return
        }
        released = true
        current.uploads--
        current.bytes -= bytes
        if (current.uploads === 0) {
          inFlight.delete(source)
        }
      }
    }
  }

  return { acquire }
}
