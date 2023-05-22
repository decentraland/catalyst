import { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError, NotFoundError } from '../../types'

export async function errorHandler(
  _ctx: IHttpServerComponent.DefaultContext<object>,
  next: () => Promise<IHttpServerComponent.IResponse>
): Promise<IHttpServerComponent.IResponse> {
  try {
    return await next()
  } catch (error: any) {
    if (error instanceof InvalidRequestError) {
      return Promise.resolve({
        status: 400,
        body: {
          error: error.message
        }
      })
    }
    if (error instanceof NotFoundError) {
      return Promise.resolve({
        status: 404,
        body: {
          error: error.message
        }
      })
    }

    throw error
  }
}