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
  DEFAULT_CONTENT_GET_RATE_LIMIT_MAX,
  DEFAULT_CONTENT_GET_RATE_LIMIT_WINDOW_SECONDS,
  Environment,
  EnvironmentBuilder,
  EnvironmentConfig
} from '../../../src/Environment'
import { metricsDeclaration } from '../../../src/metrics'
import { GlobalContext } from '../../../src/types'
import { withSyncPeerExemption } from '../../../src/controllers/sync-peer-exemption'

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
      await expect(new EnvironmentBuilder().build()).rejects.toThrow(
        'Invalid CONTENT_GET_RATE_LIMIT_WINDOW_SECONDS'
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
