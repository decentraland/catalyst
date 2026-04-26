import { IHttpServerComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { AppComponents } from '../types'
import { State } from '../adapters/synchronization-state'
import { Error } from '@dcl/catalyst-api-specs/lib/client'
import { BaseDomainError } from '../errors'
import { Middleware } from '@dcl/http-server/dist/middleware'

export function preventExecutionIfBoostrapping({
  synchronizationState
}: Pick<AppComponents, 'synchronizationState'>): Middleware<IHttpServerComponent.DefaultContext<object>> {
  return async (
    _ctx: IHttpServerComponent.DefaultContext<object>,
    next: () => Promise<IHttpServerComponent.IResponse>
  ): Promise<{ status: number; body: Error } | IHttpServerComponent.IResponse> => {
    if (synchronizationState.getState() == State.BOOTSTRAPPING) {
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
  // Typed domain errors carry their own canonical status. Subclasses of
  // BaseDomainError (InvalidRequestError, NotFoundError, and any future
  // per-component error class) get mapped automatically.
  if (error instanceof BaseDomainError && typeof error.httpStatus === 'number') {
    return {
      status: error.httpStatus,
      body: {
        error: error.message
      }
    }
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
