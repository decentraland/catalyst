import { IHttpServerComponent } from '@dcl/core-commons'
import { Middleware } from '@dcl/http-server/dist/middleware'
import { SourceUploadLimitExceededError } from '../adapters/source-upload-limits'
import { EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'
import { createClientSourceResolver } from './client-source'

// A slot frees when one of the source's uploads ends, which the source itself controls.
const SOURCE_UPLOAD_RETRY_AFTER_SECONDS = 5

/**
 * Admits a POST /entities body, before it is read, only while its source has fewer uploads and bytes
 * in flight than its share, and holds that share until the request ends. Applies to every request:
 * neither the daily quota nor the partial-upload quotas see a body that never completes.
 */
export function createSourceUploadAdmission(
  components: Pick<AppComponents, 'env' | 'sourceUploadLimits'>
): Middleware<IHttpServerComponent.DefaultContext<object>> {
  const { env, sourceUploadLimits } = components
  const sourceOf = createClientSourceResolver(components)
  const maxRequestBytes = env.getConfig<number>(EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE)
  return async (context, next) => {
    // The parser rejects a body past its declared length; one without a declaration may grow to the cap.
    const declared = parseInt(context.request.headers.get('content-length') || '', 10)
    const bytes =
      Number.isSafeInteger(declared) && declared >= 0 ? Math.min(declared, maxRequestBytes) : maxRequestBytes
    let lease
    try {
      lease = sourceUploadLimits.acquire(sourceOf(context), bytes)
    } catch (error) {
      if (error instanceof SourceUploadLimitExceededError) {
        return {
          status: 429,
          headers: { 'Retry-After': String(SOURCE_UPLOAD_RETRY_AFTER_SECONDS) },
          body: { error: error.message }
        }
      }
      throw error
    }
    try {
      return await next()
    } finally {
      lease.release()
    }
  }
}
