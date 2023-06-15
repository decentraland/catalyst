import { IHttpServerComponent } from '@well-known-components/interfaces'
import { AppComponents } from '../types'
import { State } from '../ports/synchronizationState'
import { Error } from '@dcl/catalyst-api-specs/lib/client'
import { InvalidRequestError, NotFoundError } from '../types'
import { Middleware } from '@well-known-components/http-server/dist/middleware'

export function preventExecutionIfBoostrapping({
  synchronizationState
}: Pick<AppComponents, 'synchronizationState'>): Middleware<IHttpServerComponent.DefaultContext<object>> {
  return async (
    _ctx: IHttpServerComponent.DefaultContext<object>,
    next: () => Promise<IHttpServerComponent.IResponse>
  ): Promise<{ status: number; body: Error } | IHttpServerComponent.IResponse> => {
    if (synchronizationState.getState() == State.BOOTSTRAPPING) {
      const errorBody: Error = {
        error: 'Deployments are not allowed while the Catalyst is boostrapping'
      }
      return {
        status: 503,
        body: errorBody
      }
    }

    return await next()
  }
}

function handleError(error: any): { status: number; body: Error } {
  if (error instanceof InvalidRequestError) {
    return {
      status: 400,
      body: {
        error: error.message
      }
    }
  }

  if (error instanceof NotFoundError) {
    return {
      status: 404,
      body: {
        error: error.message
      }
    }
  }

  throw error
}

export async function errorHandler(
  _ctx: IHttpServerComponent.DefaultContext<object>,
  next: () => Promise<IHttpServerComponent.IResponse>
): Promise<IHttpServerComponent.IResponse> {
  try {
    return await next()
  } catch (error: any) {
    return handleError(error)
  }
}
