/**
 * @jest-environment ./test/fetch-environment.js
 *
 * The limiter reads `context.request.headers`, so these tests need the real `Request` class. Jest 27's
 * sandboxed `node` environment omits the Web globals that Node 24 provides in production, and this is
 * the environment the integration project already uses to copy them in.
 *
 * Mirrors test/unit/controllers/post-entities-rate-limit.spec.ts: same middleware, same mounting
 * pattern, with two additions specific to GET /contents — the sync-peer exemption wrapper for DAO peers,
 * and the config that builds the exemption set (TRUSTED_SYNC_PEER_IPS).
 */
import { createInMemoryCacheComponent } from '@dcl/memory-cache-component'
import { createRateLimiterComponent, IRateLimiterComponent } from '@dcl/rate-limiter-component'
import { createTestMetricsComponent } from '@dcl/metrics'
import { IHttpServerComponent } from '@dcl/core-commons'
import {
  DEFAULT_CONTENT_GET_DAILY_QUOTA_MAX,
  DEFAULT_CONTENT_GET_HOURLY_QUOTA_MAX,
  DEFAULT_CONTENT_GET_RATE_LIMIT_IPV6_PREFIX_LENGTH,
  DEFAULT_CONTENT_GET_RATE_LIMIT_MAX,
  DEFAULT_CONTENT_GET_RATE_LIMIT_WINDOW_SECONDS,
  Environment,
  EnvironmentBuilder,
  EnvironmentConfig
} from '../../../src/Environment'
import { metricsDeclaration } from '../../../src/metrics'
import { GlobalContext } from '../../../src/types'
import { withSyncPeerExemption } from '../../../src/controllers/sync-peer-exemption'
import {
  ContentGetRateLimitConfig,
  createContentGetRateLimitMiddleware,
  ipv6NetworkKey
} from '../../../src/controllers/content-get-rate-limit'

type RateLimitedRequestContext = IHttpServerComponent.DefaultContext<GlobalContext> & {
  routerPath: string
  remoteAddress?: string
}

type RateLimitedResponse = {
  status: number
  body?: unknown
  headers: Headers
}

function buildContext(
  path: string,
  remoteAddress: string | undefined,
  headers: Record<string, string> = {}
): RateLimitedRequestContext {
  return {
    request: new Request(`http://localhost${path}`, { method: 'GET', headers }),
    url: new URL(`http://localhost${path}`),
    routerPath: path,
    remoteAddress,
    params: {}
  } as unknown as RateLimitedRequestContext
}

function createSilentLogs() {
  return {
    getLogger: () => ({
      log: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    })
  }
}

describe('when reading the GET /contents rate limit configuration', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = process.env
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('and neither the max nor the window is set', () => {
    let env: Environment

    beforeEach(async () => {
      delete process.env.CONTENT_GET_RATE_LIMIT_MAX
      delete process.env.CONTENT_GET_RATE_LIMIT_WINDOW_SECONDS
      env = await new EnvironmentBuilder().build()
    })

    it('should default to 300 requests per 60 second window', () => {
      expect([
        env.getConfig(EnvironmentConfig.CONTENT_GET_RATE_LIMIT_MAX),
        env.getConfig(EnvironmentConfig.CONTENT_GET_RATE_LIMIT_WINDOW_SECONDS)
      ]).toEqual([DEFAULT_CONTENT_GET_RATE_LIMIT_MAX, DEFAULT_CONTENT_GET_RATE_LIMIT_WINDOW_SECONDS])
    })
  })

  describe('and both the max and the window are set', () => {
    let env: Environment

    beforeEach(async () => {
      process.env.CONTENT_GET_RATE_LIMIT_MAX = '5'
      process.env.CONTENT_GET_RATE_LIMIT_WINDOW_SECONDS = '30'
      env = await new EnvironmentBuilder().build()
    })

    it('should read both values from the environment', () => {
      expect([
        env.getConfig(EnvironmentConfig.CONTENT_GET_RATE_LIMIT_MAX),
        env.getConfig(EnvironmentConfig.CONTENT_GET_RATE_LIMIT_WINDOW_SECONDS)
      ]).toEqual([5, 30])
    })
  })

  describe('and the max is set to zero', () => {
    beforeEach(() => {
      process.env.CONTENT_GET_RATE_LIMIT_MAX = '0'
    })

    it('should fail at startup rather than install a limit that rejects every download', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow('Invalid CONTENT_GET_RATE_LIMIT_MAX')
    })
  })

  describe('and the window is set to zero', () => {
    beforeEach(() => {
      process.env.CONTENT_GET_RATE_LIMIT_WINDOW_SECONDS = '0'
    })

    it('should fail at startup rather than install a zero-length window', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow('Invalid CONTENT_GET_RATE_LIMIT_WINDOW_SECONDS')
    })
  })

  describe('and none of the quota or IPv6 prefix settings is set', () => {
    let env: Environment

    beforeEach(async () => {
      delete process.env.CONTENT_GET_HOURLY_QUOTA_MAX
      delete process.env.CONTENT_GET_DAILY_QUOTA_MAX
      delete process.env.CONTENT_GET_RATE_LIMIT_IPV6_PREFIX_LENGTH
      env = await new EnvironmentBuilder().build()
    })

    it('should default to 3,000 per hour, 20,000 per day and IPv6 networks of /64', () => {
      expect([
        env.getConfig(EnvironmentConfig.CONTENT_GET_HOURLY_QUOTA_MAX),
        env.getConfig(EnvironmentConfig.CONTENT_GET_DAILY_QUOTA_MAX),
        env.getConfig(EnvironmentConfig.CONTENT_GET_RATE_LIMIT_IPV6_PREFIX_LENGTH)
      ]).toEqual([
        DEFAULT_CONTENT_GET_HOURLY_QUOTA_MAX,
        DEFAULT_CONTENT_GET_DAILY_QUOTA_MAX,
        DEFAULT_CONTENT_GET_RATE_LIMIT_IPV6_PREFIX_LENGTH
      ])
    })
  })

  describe('and the quotas and IPv6 prefix are set', () => {
    let env: Environment

    beforeEach(async () => {
      process.env.CONTENT_GET_HOURLY_QUOTA_MAX = '100'
      process.env.CONTENT_GET_DAILY_QUOTA_MAX = '1000'
      process.env.CONTENT_GET_RATE_LIMIT_IPV6_PREFIX_LENGTH = '124'
      env = await new EnvironmentBuilder().build()
    })

    it('should read all three values from the environment', () => {
      expect([
        env.getConfig(EnvironmentConfig.CONTENT_GET_HOURLY_QUOTA_MAX),
        env.getConfig(EnvironmentConfig.CONTENT_GET_DAILY_QUOTA_MAX),
        env.getConfig(EnvironmentConfig.CONTENT_GET_RATE_LIMIT_IPV6_PREFIX_LENGTH)
      ]).toEqual([100, 1000, 124])
    })
  })

  describe('and the hourly quota is set to zero', () => {
    beforeEach(() => {
      process.env.CONTENT_GET_HOURLY_QUOTA_MAX = '0'
    })

    it('should fail at startup rather than reject every download', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow('Invalid CONTENT_GET_HOURLY_QUOTA_MAX')
    })
  })

  describe('and the daily quota is set to zero', () => {
    beforeEach(() => {
      process.env.CONTENT_GET_DAILY_QUOTA_MAX = '0'
    })

    it('should fail at startup rather than reject every download', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow('Invalid CONTENT_GET_DAILY_QUOTA_MAX')
    })
  })

  describe('and the IPv6 prefix length is outside 1-128', () => {
    beforeEach(() => {
      process.env.CONTENT_GET_RATE_LIMIT_IPV6_PREFIX_LENGTH = '129'
    })

    it('should fail at startup', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow(
        'Invalid CONTENT_GET_RATE_LIMIT_IPV6_PREFIX_LENGTH'
      )
    })
  })

  describe('and TRUSTED_SYNC_PEER_IPS is unset', () => {
    let env: Environment

    beforeEach(async () => {
      delete process.env.TRUSTED_SYNC_PEER_IPS
      env = await new EnvironmentBuilder().build()
    })

    it('should default to an empty string so no peer is exempted until an operator opts one in', () => {
      expect(env.getConfig(EnvironmentConfig.TRUSTED_SYNC_PEER_IPS)).toBe('')
    })
  })
})

describe('when a client downloads content through the rate limit middleware', () => {
  let rateLimiter: IRateLimiterComponent<GlobalContext>
  let middleware: IHttpServerComponent.IRequestHandler<RateLimitedRequestContext>
  let next: jest.Mock
  let max: number
  /** Built the same way components.ts builds it: canonicalized real egress IPs, empty by default. */
  let trustedSyncPeerIps: ReadonlySet<string>

  const get = async (
    remoteAddress: string | undefined,
    headers: Record<string, string> = {}
  ): Promise<RateLimitedResponse> =>
    (await middleware(buildContext('/contents/:hashId', remoteAddress, headers), next)) as RateLimitedResponse

  beforeEach(() => {
    max = 3
    trustedSyncPeerIps = new Set()
    next = jest.fn().mockResolvedValue({ status: 200 })
    rateLimiter = createRateLimiterComponent<GlobalContext>(
      {
        cache: createInMemoryCacheComponent({ max: 100 }),
        logs: createSilentLogs(),
        metrics: createTestMetricsComponent(metricsDeclaration)
      },
      {
        keyPrefix: 'catalyst-content:rl',
        trustedClientIpHeader: 'cf-connecting-ip',
        buildLimitExceededResponse: () => ({ status: 429, body: { error: 'Too many requests' } })
      }
    )
    middleware = buildMiddleware('cf-connecting-ip')
  })

  /** Built the way routes.ts builds it: the limiter wrapped by the sync-peer exemption. */
  const buildMiddleware = (trustedClientIpHeader: string | undefined) =>
    withSyncPeerExemption<GlobalContext>(
      rateLimiter.withRateLimitMiddleware({ name: 'GET /contents', max, windowSeconds: 60 }),
      trustedSyncPeerIps,
      trustedClientIpHeader
    ) as unknown as IHttpServerComponent.IRequestHandler<RateLimitedRequestContext>

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('and the client stays within its budget', () => {
    let statuses: number[]

    beforeEach(async () => {
      statuses = []
      for (let i = 0; i < max; i++) {
        statuses.push((await get(undefined, { 'cf-connecting-ip': '203.0.113.7' })).status)
      }
    })

    it('should run the content handler for every request', () => {
      expect([statuses, next.mock.calls.length]).toEqual([[200, 200, 200], max])
    })
  })

  describe('and an unaffiliated client exceeds its budget (the 2026-10-04 incident pattern)', () => {
    let lastResponse: any

    beforeEach(async () => {
      for (let i = 0; i < max; i++) {
        await get(undefined, { 'cf-connecting-ip': '198.51.100.9' })
      }
      lastResponse = await get(undefined, { 'cf-connecting-ip': '198.51.100.9' })
    })

    it('should respond with a 429 and never reach the content handler', () => {
      expect([lastResponse.status, next.mock.calls.length]).toEqual([429, max])
    })

    it('should send a Retry-After the client can back off on', () => {
      expect(Number(lastResponse.headers.get('Retry-After'))).toBeGreaterThan(0)
    })
  })

  describe('and the caller is a DAO sync peer listed in TRUSTED_SYNC_PEER_IPS', () => {
    let statuses: number[]

    beforeEach(async () => {
      trustedSyncPeerIps = new Set(['203.0.113.50'])
      middleware = buildMiddleware('cf-connecting-ip')
      statuses = []
      // One more request than the budget allows: every one of them must still pass, because this
      // identity is exempted rather than merely given a larger budget.
      for (let i = 0; i < max + 2; i++) {
        statuses.push((await get(undefined, { 'cf-connecting-ip': '203.0.113.50' })).status)
      }
    })

    it('should never be throttled during a full resync/bootstrap', () => {
      expect(statuses).toEqual([200, 200, 200, 200, 200])
    })

    it('should not count towards the handler at all beyond what next() reflects', () => {
      expect(next.mock.calls.length).toBe(max + 2)
    })
  })

  describe('and a different, non-exempt client shares the budget independently of the exempt peer', () => {
    let exemptStatuses: number[]
    let otherStatus: number

    beforeEach(async () => {
      trustedSyncPeerIps = new Set(['203.0.113.50'])
      middleware = buildMiddleware('cf-connecting-ip')
      exemptStatuses = []
      for (let i = 0; i < max + 1; i++) {
        exemptStatuses.push((await get(undefined, { 'cf-connecting-ip': '203.0.113.50' })).status)
      }
      otherStatus = (await get(undefined, { 'cf-connecting-ip': '198.51.100.9' })).status
    })

    it('should exempt the peer while still bounding everyone else', () => {
      expect([exemptStatuses, otherStatus]).toEqual([[200, 200, 200, 200], 200])
    })
  })
})

describe('when the catalyst is exposed directly, with no trusted client IP header', () => {
  let middleware: IHttpServerComponent.IRequestHandler<RateLimitedRequestContext>
  let next: jest.Mock
  const max = 2

  // No header configured: the limiter keys on the socket address, so the exemption must too.
  const getDirect = async (remoteAddress: string): Promise<RateLimitedResponse> =>
    (await middleware(buildContext('/contents/:hashId', remoteAddress), next)) as RateLimitedResponse

  beforeEach(() => {
    next = jest.fn().mockResolvedValue({ status: 200 })
    const rateLimiter = createRateLimiterComponent<GlobalContext>(
      {
        cache: createInMemoryCacheComponent({ max: 100 }),
        logs: createSilentLogs(),
        metrics: createTestMetricsComponent(metricsDeclaration)
      },
      {
        keyPrefix: 'catalyst-content:rl',
        buildLimitExceededResponse: () => ({ status: 429, body: { error: 'Too many requests' } })
      }
    )
    middleware = withSyncPeerExemption<GlobalContext>(
      rateLimiter.withRateLimitMiddleware({ name: 'GET /contents', max, windowSeconds: 60 }),
      new Set(['203.0.113.50']),
      undefined
    ) as unknown as IHttpServerComponent.IRequestHandler<RateLimitedRequestContext>
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('and the caller is a listed DAO sync peer connecting from its socket address', () => {
    let statuses: number[]

    beforeEach(async () => {
      statuses = []
      for (let i = 0; i < max + 2; i++) {
        statuses.push((await getDirect('203.0.113.50')).status)
      }
    })

    it('should never be throttled', () => {
      expect(statuses).toEqual([200, 200, 200, 200])
    })
  })

  describe('and the caller is listed only in IPv4-mapped IPv6 form on the socket', () => {
    let statuses: number[]

    beforeEach(async () => {
      statuses = []
      for (let i = 0; i < max + 1; i++) {
        statuses.push((await getDirect('::ffff:203.0.113.50')).status)
      }
    })

    it('should canonicalize the socket address before matching the allowlist', () => {
      expect(statuses).toEqual([200, 200, 200])
    })
  })

  describe('and the caller is not listed', () => {
    let statuses: number[]

    beforeEach(async () => {
      statuses = []
      for (let i = 0; i < max + 1; i++) {
        statuses.push((await getDirect('198.51.100.9')).status)
      }
    })

    it('should still be bounded by the per-client budget', () => {
      expect(statuses).toEqual([200, 200, 429])
    })
  })
})

describe('when deriving the rate-limit identity of a client address', () => {
  describe('and the address is IPv6', () => {
    it('should key it by its /64 network', () => {
      expect([
        ipv6NetworkKey('2a03:b0c0:3:f0:0:3:410:3000', 64),
        ipv6NetworkKey('2a03:b0c0:3:f0:0:2:6d50:c000', 64)
      ]).toEqual(['2a03:b0c0:3:f0:0:0:0:0/64', '2a03:b0c0:3:f0:0:0:0:0/64'])
    })

    it('should mask a prefix length that is not a multiple of 16', () => {
      expect(ipv6NetworkKey('2001:db8::1:0:0:1f', 124)).toBe('2001:db8:0:0:1:0:0:10/124')
    })

    it('should expand zero-compression and ignore a zone id', () => {
      expect([ipv6NetworkKey('::1', 64), ipv6NetworkKey('fe80::1%eth0', 64)]).toEqual([
        '0:0:0:0:0:0:0:0/64',
        'fe80:0:0:0:0:0:0:0/64'
      ])
    })

    it('should handle an embedded dotted IPv4 tail', () => {
      expect(ipv6NetworkKey('64:ff9b::1.2.3.4', 128)).toBe('64:ff9b:0:0:0:0:102:304/128')
    })
  })

  describe('and the address is IPv4 or malformed', () => {
    it('should return null so the limiter keys on the address itself', () => {
      expect([ipv6NetworkKey('203.0.113.7', 64), ipv6NetworkKey('1::2::3', 64), ipv6NetworkKey('zz::1', 64)]).toEqual([
        null,
        null,
        null
      ])
    })
  })
})

describe('when a client downloads content through the full GET /contents limit (burst + hourly + daily)', () => {
  let next: jest.Mock
  let middleware: IHttpServerComponent.IRequestHandler<RateLimitedRequestContext>
  let config: ContentGetRateLimitConfig

  const get = async (ip: string): Promise<RateLimitedResponse> =>
    (await middleware(
      buildContext('/contents/:hashId', undefined, { 'cf-connecting-ip': ip }),
      next
    )) as RateLimitedResponse

  const statusesFor = async (ips: string[]) => {
    const statuses: number[] = []
    for (const ip of ips) statuses.push((await get(ip)).status)
    return statuses
  }

  const build = (trustedSyncPeerIps: ReadonlySet<string> = new Set()) => {
    const rateLimiter = createRateLimiterComponent<GlobalContext>(
      {
        cache: createInMemoryCacheComponent({ max: 100 }),
        logs: createSilentLogs(),
        metrics: createTestMetricsComponent(metricsDeclaration)
      },
      {
        keyPrefix: 'catalyst-content:rl',
        trustedClientIpHeader: 'cf-connecting-ip',
        buildLimitExceededResponse: () => ({ status: 429, body: { error: 'Too many requests' } })
      }
    )
    middleware = createContentGetRateLimitMiddleware<GlobalContext>(
      rateLimiter,
      trustedSyncPeerIps,
      'cf-connecting-ip',
      config
    ) as unknown as IHttpServerComponent.IRequestHandler<RateLimitedRequestContext>
  }

  beforeEach(() => {
    next = jest.fn().mockResolvedValue({ status: 200 })
    config = { burstMax: 100, burstWindowSeconds: 60, hourlyMax: 3, dailyMax: 100, ipv6PrefixLength: 64 }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('and the client stays under the burst limit but exceeds the hourly quota', () => {
    let statuses: number[]

    beforeEach(async () => {
      build()
      statuses = await statusesFor(['198.51.100.9', '198.51.100.9', '198.51.100.9', '198.51.100.9'])
    })

    it('should reject once the hourly quota is spent', () => {
      expect([statuses, next.mock.calls.length]).toEqual([[200, 200, 200, 429], 3])
    })
  })

  describe('and the client stays under the burst and hourly limits but exceeds the daily quota', () => {
    let statuses: number[]

    beforeEach(async () => {
      config = { ...config, hourlyMax: 100, dailyMax: 2 }
      build()
      statuses = await statusesFor(['198.51.100.9', '198.51.100.9', '198.51.100.9'])
    })

    it('should reject once the daily quota is spent', () => {
      expect(statuses).toEqual([200, 200, 429])
    })
  })

  describe('and an IPv6 client rotates addresses within one /64', () => {
    let statuses: number[]

    beforeEach(async () => {
      build()
      statuses = await statusesFor([
        '2a03:b0c0:3:f0::1',
        '2a03:b0c0:3:f0::2',
        '2a03:b0c0:3:f0:0:3:410:3000',
        '2a03:b0c0:3:f0:ffff::9'
      ])
    })

    it('should count every address against the same budget', () => {
      expect(statuses).toEqual([200, 200, 200, 429])
    })
  })

  describe('and two IPv6 clients are in different /64 networks', () => {
    let statuses: number[]

    beforeEach(async () => {
      build()
      statuses = await statusesFor(['2a03:b0c0:3:f0::1', '2a03:b0c0:3:f0::1', '2a03:b0c0:3:f0::1', '2a03:b0c0:3:f1::1'])
    })

    it('should give each network its own budget', () => {
      expect(statuses).toEqual([200, 200, 200, 200])
    })
  })

  describe('and the IPv6 prefix length is 128', () => {
    let statuses: number[]

    beforeEach(async () => {
      config = { ...config, ipv6PrefixLength: 128 }
      build()
      statuses = await statusesFor(['2a03:b0c0:3:f0::1', '2a03:b0c0:3:f0::1', '2a03:b0c0:3:f0::1', '2a03:b0c0:3:f0::2'])
    })

    it('should count each address separately', () => {
      expect(statuses).toEqual([200, 200, 200, 200])
    })
  })

  describe('and different IPv4 clients share no budget', () => {
    let statuses: number[]

    beforeEach(async () => {
      build()
      statuses = await statusesFor(['198.51.100.9', '198.51.100.9', '198.51.100.9', '198.51.100.10'])
    })

    it('should keep counting IPv4 clients per address', () => {
      expect(statuses).toEqual([200, 200, 200, 200])
    })
  })

  describe('and the caller is a listed DAO sync peer', () => {
    let statuses: number[]

    beforeEach(async () => {
      config = { ...config, burstMax: 1, hourlyMax: 1, dailyMax: 1 }
      build(new Set(['203.0.113.50']))
      statuses = await statusesFor(['203.0.113.50', '203.0.113.50', '203.0.113.50'])
    })

    it('should bypass the burst limit and both quotas', () => {
      expect(statuses).toEqual([200, 200, 200])
    })
  })
})
