import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { SourceUploadLimitExceededError } from './errors'
import { ISourceUploadLimits, SourceUploadLease } from './types'

const UNLIMITED_LEASE: SourceUploadLease = { release: () => undefined }

/**
 * Creates the per-source in-flight upload limits of this process. They bound this process's memory,
 * so they are process-local by design. Disabled without TRUSTED_CLIENT_IP_HEADER, where the only source
 * is the socket address.
 * @param components Environment, logging and metrics.
 * @returns The per-source upload limits.
 * @throws Error when the per-source byte share cannot fit one maximum-size request.
 */
export function createSourceUploadLimits(
  components: Pick<AppComponents, 'env' | 'logs' | 'metrics'>
): ISourceUploadLimits {
  const { env, logs, metrics } = components
  const maxUploads = env.getConfig<number>(EnvironmentConfig.MAX_CONCURRENT_UPLOADS_PER_SOURCE)
  const maxRequestBytes = env.getConfig<number>(EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE)
  const maxBytes =
    env.getConfig<number | undefined>(EnvironmentConfig.MAX_IN_FLIGHT_UPLOAD_BYTES_PER_SOURCE) ?? maxRequestBytes
  if (maxBytes < maxRequestBytes) {
    throw new Error(
      `MAX_IN_FLIGHT_UPLOAD_BYTES_PER_SOURCE (${maxBytes}) must fit one maximum-size upload: MAX_UPLOAD_TOTAL_SIZE (${maxRequestBytes}).`
    )
  }

  // Behind a proxy every client shares its address, so a per-source cap would cap the whole node; the
  // global upload budget still bounds memory.
  if (!env.getConfig<string | undefined>(EnvironmentConfig.TRUSTED_CLIENT_IP_HEADER)) {
    logs
      .getLogger('source-upload-limits')
      .warn(
        'TRUSTED_CLIENT_IP_HEADER is unset, so POST /entities uploads are not limited per client source: ' +
          'behind a proxy the socket address is shared by every client. Only the global upload budget applies.'
      )
    return { acquire: () => UNLIMITED_LEASE }
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
