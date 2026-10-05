import { IHttpServerComponent } from '@dcl/core-commons'
import { canonicalizeIpAddress, clientIpFromForwardedHeader } from '@dcl/rate-limiter-component'

/**
 * Resolves the caller's address the same way `@dcl/rate-limiter-component` does when no `getKey` is
 * configured: the trusted header first (read from the right, one trusted proxy — the component's
 * default, which `components.ts` does not override), then the socket address. Mirroring it exactly
 * means a sync peer is exempted under the same identity it would otherwise be counted under.
 */
export function resolveClientIp(
  context: Pick<IHttpServerComponent.DefaultContext<object>, 'request' | 'remoteAddress'>,
  trustedClientIpHeader: string | undefined
): string | null {
  if (trustedClientIpHeader) {
    const fromHeader = clientIpFromForwardedHeader(context.request.headers.get(trustedClientIpHeader), 1)
    if (fromHeader) return fromHeader
  }
  return canonicalizeIpAddress(context.remoteAddress)
}

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
