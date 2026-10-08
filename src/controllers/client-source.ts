import { IHttpServerComponent } from '@dcl/core-commons'
import { canonicalizeIpAddress, clientIpFromForwardedHeader } from '@dcl/rate-limiter-component'
import { EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'

/** Resolves the client source a request is limited as. An empty string means none could be established. */
export type ClientSourceResolver = (context: IHttpServerComponent.DefaultContext<object>) => string

/**
 * Resolves the caller's address the way `@dcl/rate-limiter-component` keys it by default: the trusted
 * forwarding header (read from the right, one trusted proxy), else the socket address, both canonicalized.
 * Every limit and exemption resolves the client through here so they agree on who a request came from.
 * @param context Request context.
 * @param trustedClientIpHeader The `TRUSTED_CLIENT_IP_HEADER` setting.
 * @returns The canonical client IP, or `null` when none could be established.
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
 * Builds the resolver of the client identity the rate limiter derives (see `resolveClientIp`).
 * @param components Environment.
 * @returns The client source resolver.
 */
export function createClientSourceResolver(components: Pick<AppComponents, 'env'>): ClientSourceResolver {
  const trustedHeader = components.env.getConfig<string | undefined>(EnvironmentConfig.TRUSTED_CLIENT_IP_HEADER)
  return (context) => resolveClientIp(context, trustedHeader) ?? ''
}
