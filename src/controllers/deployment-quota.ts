import { IHttpServerComponent } from '@dcl/core-commons'
import { Middleware } from '@dcl/http-server/dist/middleware'
import { canonicalizeIpAddress, clientIpFromForwardedHeader } from '@dcl/rate-limiter-component'
import { EnvironmentConfig } from '../Environment'
import { DeploymentQuotaExceededError } from '../logic/deployment-quota'
import { AppComponents, FormDataContext } from '../types'
import { InvalidRequestError } from './errors'

type QuotaComponents = Pick<AppComponents, 'deploymentQuota' | 'env'>

/** Whether the request declares, before its body, that it is a partial deployment batch. */
export function isDeclaredPartial(context: IHttpServerComponent.DefaultContext<object>): boolean {
  return context.url.searchParams.get('partial') === 'true'
}

function quotaExceededResponse(error: DeploymentQuotaExceededError): IHttpServerComponent.IResponse {
  return {
    status: 429,
    headers: { 'Retry-After': String(error.retryAfterSeconds) },
    body: { error: 'Too many requests' }
  }
}

// Same client identity the rate limiter derives: the trusted forwarding header, else the socket address.
function clientSource(components: QuotaComponents): (context: IHttpServerComponent.DefaultContext<object>) => string {
  const trustedHeader = components.env.getConfig<string | undefined>(EnvironmentConfig.TRUSTED_CLIENT_IP_HEADER)
  return (context) =>
    (trustedHeader && clientIpFromForwardedHeader(context.request.headers.get(trustedHeader), 1)) ||
    canonicalizeIpAddress(context.remoteAddress) ||
    ''
}

/**
 * Turns away, before the body is read, a request from a source whose daily deployment quota is spent,
 * unless it declares itself a partial batch with `?partial=true`. Nothing is counted here.
 */
export function createDeploymentQuotaAdmission(
  components: QuotaComponents
): Middleware<IHttpServerComponent.DefaultContext<object>> {
  const { deploymentQuota } = components
  const sourceOf = clientSource(components)
  return async (context, next) => {
    if (!isDeclaredPartial(context)) {
      try {
        await deploymentQuota.assertAvailable(sourceOf(context))
      } catch (error) {
        if (error instanceof DeploymentQuotaExceededError) {
          return quotaExceededResponse(error)
        }
        throw error
      }
    }
    return next()
  }
}

/**
 * Wraps the parsed POST /entities handler: counts regular deployments against the daily quota, lets
 * partial batches through uncounted, and rejects a `?partial=true` request whose form isn't partial.
 */
export function withDeploymentQuota<Ctx extends FormDataContext<object>>(
  components: QuotaComponents,
  handler: (context: Ctx) => Promise<IHttpServerComponent.IResponse>
): (context: Ctx) => Promise<IHttpServerComponent.IResponse> {
  const { deploymentQuota } = components
  const sourceOf = clientSource(components)
  return async (context) => {
    const isPartial = context.formData.fields.partial?.value === 'true'
    if (!isPartial) {
      // Otherwise the query flag would carry a regular deployment past the pre-body quota check.
      if (isDeclaredPartial(context)) {
        throw new InvalidRequestError("The 'partial=true' query parameter requires the 'partial=true' form field")
      }
      try {
        await deploymentQuota.consume(sourceOf(context))
      } catch (error) {
        if (error instanceof DeploymentQuotaExceededError) {
          return quotaExceededResponse(error)
        }
        throw error
      }
    }
    return handler(context)
  }
}
