import { Error } from '@dcl/catalyst-api-specs/lib/client'
import { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError, NotFoundError } from '../../types'

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
