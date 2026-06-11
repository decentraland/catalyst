import { ILoggerComponent } from '@well-known-components/interfaces'
import { IHttpServerComponent } from '@dcl/core-commons'
import { AppComponents } from '../types'
import { State } from '../logic/sync-orchestrator'
import { Error } from '@dcl/catalyst-api-specs/lib/client'
import { InvalidRequestError, NotFoundError, PayloadTooLargeError } from './errors'
import { Middleware } from '@dcl/http-server/dist/middleware'

export function preventExecutionIfBoostrapping({
  syncOrchestrator
}: Pick<AppComponents, 'syncOrchestrator'>): Middleware<IHttpServerComponent.DefaultContext<object>> {
  return async (
    _ctx: IHttpServerComponent.DefaultContext<object>,
    next: () => Promise<IHttpServerComponent.IResponse>
  ): Promise<{ status: number; body: Error } | IHttpServerComponent.IResponse> => {
    if (syncOrchestrator.getState() == State.BOOTSTRAPPING) {
      const errorBody: Error = {
        error: 'Deployments are not allowed while the Catalyst is bootstrapping'
      }
      return {
        status: 503,
        body: errorBody
      }
    }

    return await next()
  }
}

function handleError(logger: ILoggerComponent.ILogger, error: any): { status: number; body: Error } {
  // Handlers throw HTTP-shaped errors (defined in `./errors.ts`) when they
  // want to surface a specific status. Add a new branch when a new HTTP error
  // class is introduced. Anything else is treated as an unexpected failure
  // and surfaces as 500 to avoid leaking internal details.
  if (error instanceof InvalidRequestError) {
    return { status: 400, body: { error: error.message } }
  }
  if (error instanceof NotFoundError) {
    return { status: 404, body: { error: error.message } }
  }
  if (error instanceof PayloadTooLargeError) {
    return { status: 413, body: { error: error.message } }
  }

  logger.error(error)

  // Prevent potential sensitive information leaks
  // by avoiding the return of error.message
  return {
    status: 500,
    body: {
      error: 'Internal Server Error'
    }
  }
}

export function createErrorHandler({
  logs
}: Pick<AppComponents, 'logs'>): Middleware<IHttpServerComponent.DefaultContext<object>> {
  const logger = logs.getLogger('error-handler')

  return async function errorHandler(
    _ctx: IHttpServerComponent.DefaultContext<object>,
    next: () => Promise<IHttpServerComponent.IResponse>
  ): Promise<IHttpServerComponent.IResponse> {
    try {
      return await next()
    } catch (error: any) {
      return handleError(logger, error)
    }
  }
}
