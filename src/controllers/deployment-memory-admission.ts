import { IHttpServerComponent } from '@dcl/core-commons'
import { Middleware } from '@dcl/http-server/dist/middleware'
import { UploadBudgetExceededError } from '../adapters/upload-budget'
import { EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'
import { isDeclaredPartial } from './deployment-quota'
import { ServiceUnavailableError } from './errors'
import { UPLOAD_UNAVAILABLE_RETRY_AFTER_SECONDS } from './multipart'

/**
 * Sheds a regular deployment, before its body is read, when its declared size doesn't fit the memory
 * budget its files are read into. Nothing is reserved here: the handler reserves the files' actual size
 * once they are received, so a body that declares more than it sends never holds the budget. Partial
 * batches (`?partial=true`) stream from disk and are not checked.
 */
export function createDeploymentMemoryAdmission(
  components: Pick<AppComponents, 'env' | 'deploymentMemoryBudget'>
): Middleware<IHttpServerComponent.DefaultContext<object>> {
  const { env, deploymentMemoryBudget } = components
  const maxRequestBytes = env.getConfig<number>(EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE)
  return async (context, next) => {
    if (!isDeclaredPartial(context)) {
      // The files are at most the body less its framing, and at most the payload limit.
      const declared = parseInt(context.request.headers.get('content-length') || '', 10)
      const bytes = Number.isSafeInteger(declared) && declared > 0 ? Math.min(declared, maxRequestBytes) : 0
      if (!deploymentMemoryBudget.fits(bytes)) {
        throw new ServiceUnavailableError(
          new UploadBudgetExceededError().message,
          UPLOAD_UNAVAILABLE_RETRY_AFTER_SECONDS
        )
      }
    }
    return next()
  }
}
