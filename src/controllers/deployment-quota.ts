import { IHttpServerComponent } from '@dcl/core-commons'
import { Middleware } from '@dcl/http-server/dist/middleware'
import { DeploymentQuotaExceededError } from '../logic/deployment-quota'
import { AppComponents, FormDataContext } from '../types'
import { createClientSourceResolver } from './client-source'
import { InvalidRequestError } from './errors'

type QuotaComponents = Pick<AppComponents, 'deploymentQuota' | 'env'>

/** The daily quota's state for a partial batch, shared with the handler. */
export type PartialQuotaState = {
  /** Set when the source has spent its quota: only resumes of the signer's own live upload may proceed. */
  exhaustedRetryAfterSeconds?: number
  /** Set by the handler once the batch joins its upload; batches rejected before that are counted. */
  admitted: boolean
}

export type PartialQuotaContext = { partialQuota?: PartialQuotaState }

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

/**
 * Turns away, before the body is read, a request from a source whose daily deployment quota is spent,
 * unless it declares itself a partial batch with `?partial=true`, which is only checked once parsed.
 * Nothing is counted here.
 */
export function createDeploymentQuotaAdmission(
  components: QuotaComponents
): Middleware<IHttpServerComponent.DefaultContext<object>> {
  const { deploymentQuota } = components
  const sourceOf = createClientSourceResolver(components)
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
 * Wraps the parsed POST /entities handler: counts regular deployments against the daily quota, and
 * partial batches rejected (400) before joining their upload, and rejects a `?partial=true` request
 * whose form isn't partial. Partial batches of a spent source may only resume the signer's own upload.
 */
export function withDeploymentQuota<Ctx extends FormDataContext<object>>(
  components: QuotaComponents,
  handler: (context: Ctx) => Promise<IHttpServerComponent.IResponse>
): (context: Ctx) => Promise<IHttpServerComponent.IResponse> {
  const { deploymentQuota } = components
  const sourceOf = createClientSourceResolver(components)

  // A rejected partial batch is counted as a deployment, keeping its own answer.
  async function countRejected(source: string): Promise<void> {
    try {
      await deploymentQuota.consume(source)
    } catch (error) {
      if (!(error instanceof DeploymentQuotaExceededError)) throw error
    }
  }

  async function handlePartial(context: Ctx): Promise<IHttpServerComponent.IResponse> {
    const source = sourceOf(context)
    const state: PartialQuotaState = { admitted: false }
    try {
      await deploymentQuota.assertAvailable(source)
    } catch (error) {
      if (!(error instanceof DeploymentQuotaExceededError)) throw error
      state.exhaustedRetryAfterSeconds = error.retryAfterSeconds
    }
    const partialContext: PartialQuotaContext = { partialQuota: state }
    Object.assign(context, partialContext)
    let response: IHttpServerComponent.IResponse
    try {
      response = await handler(context)
    } catch (error) {
      if (error instanceof InvalidRequestError && !state.admitted) await countRejected(source)
      throw error
    }
    if (response.status === 400 && !state.admitted) await countRejected(source)
    return response
  }

  return async (context) => {
    const isPartial = context.formData.fields.partial?.value === 'true'
    if (isPartial) {
      return handlePartial(context)
    }
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
    return handler(context)
  }
}
