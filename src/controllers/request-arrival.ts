import { IHttpServerComponent } from '@dcl/core-commons'
import { Middleware } from '@dcl/http-server/dist/middleware'

/** A request context stamped with when the request arrived, before its body was read. */
export type RequestArrivalContext = { requestArrivedAt: number }

/**
 * Stamps the request with its arrival time, so time limits that start with a request (a partial
 * upload's lifetime and freshness) don't depend on how long its body took to arrive.
 */
export function stampRequestArrival(): Middleware<IHttpServerComponent.DefaultContext<object>> {
  return async (context, next) => {
    const arrival: RequestArrivalContext = { requestArrivedAt: Date.now() }
    Object.assign(context, arrival)
    return next()
  }
}

/**
 * Types a handler behind {@link stampRequestArrival} as receiving the stamp.
 * @throws Error when the route did not stamp the request.
 */
export function withRequestArrival<Ctx extends object, R>(
  handler: (context: Ctx & RequestArrivalContext) => Promise<R>
): (context: Ctx) => Promise<R> {
  return async (context) => {
    if (typeof (context as Partial<RequestArrivalContext>).requestArrivedAt !== 'number') {
      throw new Error('The request was not stamped with its arrival time')
    }
    return handler(context as Ctx & RequestArrivalContext)
  }
}
