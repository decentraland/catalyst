import { IHttpServerComponent } from '@dcl/core-commons'
import { IRateLimiterComponent } from '@dcl/rate-limiter-component'
import { resolveClientIp } from './client-source'
import { withSyncPeerExemption } from './sync-peer-exemption'

export type ContentGetRateLimitConfig = {
  /** Per-client burst limit: requests allowed per `burstWindowSeconds`. */
  burstMax: number
  burstWindowSeconds: number
  /** Per-client requests allowed per hour. */
  hourlyMax: number
  /** Per-client requests allowed per day. */
  dailyMax: number
  /** IPv6 clients are counted per network of this prefix length (1-128); IPv4 clients per address. */
  ipv6PrefixLength: number
}

/**
 * Expands a canonical IPv6 address (as produced by `canonicalizeIpAddress`) into its eight 16-bit
 * groups. Returns `null` for anything that is not IPv6, including IPv4 and IPv4-mapped addresses,
 * which `canonicalizeIpAddress` already collapses to plain IPv4.
 */
function parseIpv6Groups(address: string): number[] | null {
  const withoutZone = address.split('%')[0]
  if (!withoutZone.includes(':')) return null

  let text = withoutZone
  // An embedded dotted IPv4 tail (e.g. `64:ff9b::1.2.3.4`) is two trailing groups.
  const dotted = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text)
  if (dotted) {
    const octets = dotted.slice(2).map(Number)
    if (octets.some((octet) => octet > 255)) return null
    text = `${dotted[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`
  }

  const halves = text.split('::')
  if (halves.length > 2) return null
  const toGroups = (part: string) => (part === '' ? [] : part.split(':'))
  const head = toGroups(halves[0])
  const tail = halves.length === 2 ? toGroups(halves[1]) : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null

  const groups = [...head, ...new Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null
  return groups.map((group) => parseInt(group, 16))
}

/**
 * The rate-limit identity for an IPv6 client: its network at `prefixLength`, written as
 * `<masked address>/<prefixLength>`. Returns `null` for IPv4 (and anything unparseable), so the
 * limiter falls through to its own per-address key.
 *
 * Without this, each full IPv6 address gets its own budget, and a host that is routed a whole /64
 * can rotate addresses to get a fresh allowance on every request.
 */
export function ipv6NetworkKey(address: string, prefixLength: number): string | null {
  const groups = parseIpv6Groups(address)
  if (groups === null) return null
  const masked = groups.map((group, index) => {
    const bitsKept = Math.max(0, Math.min(16, prefixLength - index * 16))
    const mask = bitsKept === 0 ? 0 : (0xffff << (16 - bitsKept)) & 0xffff
    return (group & mask).toString(16)
  })
  return `${masked.join(':')}/${prefixLength}`
}

/** Runs `handlers` in order as one middleware; each must call `next` for the following one to run. */
function chainHandlers<Context extends object>(
  handlers: IHttpServerComponent.IRequestHandler<Context>[]
): IHttpServerComponent.IRequestHandler<Context> {
  return (context, next) => {
    const run = (index: number): Promise<IHttpServerComponent.IResponse> =>
      index === handlers.length ? next() : handlers[index](context, () => run(index + 1))
    return run(0)
  }
}

/**
 * Builds the GET/HEAD /contents/:hashId rate limit: a per-minute burst limit plus hourly and daily
 * quotas, each an independent bucket, all keyed by client IP (IPv6 by network, see
 * `ipv6NetworkKey`). Listed DAO sync peers (`trustedSyncPeerIps`) bypass all three.
 *
 * The burst limit runs first, so requests it rejects do not also drain the hourly and daily quotas.
 */
export function createContentGetRateLimitMiddleware<Context extends object>(
  rateLimiter: IRateLimiterComponent<Context>,
  trustedSyncPeerIps: ReadonlySet<string>,
  trustedClientIpHeader: string | undefined,
  config: ContentGetRateLimitConfig
): IHttpServerComponent.IRequestHandler<Context> {
  // Resolved the same way the limiter resolves its default key, so IPv4 callers are counted exactly
  // as before and IPv6 callers under their network instead of their single address.
  const getKey = (context: IHttpServerComponent.DefaultContext<Context>) => {
    const ip = resolveClientIp(context, trustedClientIpHeader)
    return ip === null ? null : ipv6NetworkKey(ip, config.ipv6PrefixLength)
  }

  const limiters = chainHandlers<Context>([
    rateLimiter.withRateLimitMiddleware({
      name: 'GET /contents',
      max: config.burstMax,
      windowSeconds: config.burstWindowSeconds,
      getKey
    }),
    rateLimiter.withRateLimitMiddleware({
      name: 'GET /contents hourly-quota',
      max: config.hourlyMax,
      windowSeconds: 3600,
      getKey
    }),
    rateLimiter.withRateLimitMiddleware({
      name: 'GET /contents daily-quota',
      max: config.dailyMax,
      windowSeconds: 86400,
      getKey
    })
  ])

  return withSyncPeerExemption(limiters, trustedSyncPeerIps, trustedClientIpHeader)
}
