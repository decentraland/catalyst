import { IHttpServerComponent } from '@dcl/core-commons'
import { canonicalizeIpAddress, clientIpFromForwardedHeader } from '@dcl/rate-limiter-component'
import { EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'

/** Resolves the client source a request is limited as. An empty string means none could be established. */
export type ClientSourceResolver = (context: IHttpServerComponent.DefaultContext<object>) => string

/**
 * Builds the resolver of the client identity the rate limiter derives: the trusted forwarding header,
 * else the socket address, both canonicalized.
 * @param components Environment.
 * @returns The client source resolver.
 */
export function createClientSourceResolver(components: Pick<AppComponents, 'env'>): ClientSourceResolver {
  const trustedHeader = components.env.getConfig<string | undefined>(EnvironmentConfig.TRUSTED_CLIENT_IP_HEADER)
  return (context) =>
    (trustedHeader && clientIpFromForwardedHeader(context.request.headers.get(trustedHeader), 1)) ||
    canonicalizeIpAddress(context.remoteAddress) ||
    ''
}
