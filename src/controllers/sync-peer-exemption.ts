import { IHttpServerComponent } from '@dcl/core-commons'
import { resolveClientIp } from './client-source'

/**
 * Wraps a rate-limit middleware so requests from `trustedSyncPeerIps` bypass it entirely.
 *
 * A wrapper rather than the limiter's own `skip` option: `skip` only receives `context.request`, so it
 * cannot see `context.remoteAddress`. On a directly exposed node (no `TRUSTED_CLIENT_IP_HEADER`) the
 * limiter keys on the socket address, and a `skip` that could only read headers would leave listed
 * peers throttled there.
 */
export function withSyncPeerExemption<Context extends object>(
  limiter: IHttpServerComponent.IRequestHandler<Context>,
  trustedSyncPeerIps: ReadonlySet<string>,
  trustedClientIpHeader: string | undefined
): IHttpServerComponent.IRequestHandler<Context> {
  if (trustedSyncPeerIps.size === 0) return limiter
  return async (context, next) => {
    const ip = resolveClientIp(context, trustedClientIpHeader)
    if (ip !== null && trustedSyncPeerIps.has(ip)) {
      return next()
    }
    return limiter(context, next)
  }
}
