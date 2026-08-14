/**
 * @jest-environment ./test/fetch-environment.js
 *
 * The limiter reads `context.request.headers`, so these tests need the real `Request` class. Jest 27's
 * sandboxed `node` environment omits the Web globals that Node 24 provides in production, and this is
 * the environment the integration project already uses to copy them in.
 */
import { createInMemoryCacheComponent } from '@dcl/memory-cache-component'
import { createRateLimiterComponent, IRateLimiterComponent } from '@dcl/rate-limiter-component'
import { createTestMetricsComponent } from '@dcl/metrics'
import { IHttpServerComponent } from '@dcl/core-commons'
import {
  DEFAULT_POST_ENTITIES_RATE_LIMIT_MAX,
  DEFAULT_POST_ENTITIES_RATE_LIMIT_WINDOW_SECONDS,
  Environment,
  EnvironmentBuilder,
  EnvironmentConfig
} from '../../../src/Environment'
import { metricsDeclaration } from '../../../src/metrics'
import { GlobalContext } from '../../../src/types'

/** A logger that records nothing: these tests assert on behaviour, not on log output. */
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

describe('when reading the POST /entities rate limit configuration', () => {
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
      delete process.env.POST_ENTITIES_RATE_LIMIT_MAX
      delete process.env.POST_ENTITIES_RATE_LIMIT_WINDOW_SECONDS
      env = await new EnvironmentBuilder().build()
    })

    it('should allow 200 requests in a 60 second window so the server runs unconfigured', () => {
      expect([
        env.getConfig(EnvironmentConfig.POST_ENTITIES_RATE_LIMIT_MAX),
        env.getConfig(EnvironmentConfig.POST_ENTITIES_RATE_LIMIT_WINDOW_SECONDS)
      ]).toEqual([DEFAULT_POST_ENTITIES_RATE_LIMIT_MAX, DEFAULT_POST_ENTITIES_RATE_LIMIT_WINDOW_SECONDS])
    })
  })

  describe('and both the max and the window are set', () => {
    let env: Environment

    beforeEach(async () => {
      process.env.POST_ENTITIES_RATE_LIMIT_MAX = '5'
      process.env.POST_ENTITIES_RATE_LIMIT_WINDOW_SECONDS = '30'
      env = await new EnvironmentBuilder().build()
    })

    it('should read both values from the environment', () => {
      expect([
        env.getConfig(EnvironmentConfig.POST_ENTITIES_RATE_LIMIT_MAX),
        env.getConfig(EnvironmentConfig.POST_ENTITIES_RATE_LIMIT_WINDOW_SECONDS)
      ]).toEqual([5, 30])
    })
  })

  describe('and the max is set to zero', () => {
    beforeEach(() => {
      process.env.POST_ENTITIES_RATE_LIMIT_MAX = '0'
    })

    it('should fail at startup rather than install a limit that rejects every deployment', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow(
        'Invalid POST_ENTITIES_RATE_LIMIT_MAX'
      )
    })
  })

  describe('and the window is set to zero', () => {
    beforeEach(() => {
      process.env.POST_ENTITIES_RATE_LIMIT_WINDOW_SECONDS = '0'
    })

    it('should fail at startup rather than install a zero-length window', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow(
        'Invalid POST_ENTITIES_RATE_LIMIT_WINDOW_SECONDS'
      )
    })
  })

  describe('and the max is not a number', () => {
    beforeEach(() => {
      process.env.POST_ENTITIES_RATE_LIMIT_MAX = '200req'
    })

    it('should fail at startup rather than silently truncate the value', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow(
        'Invalid POST_ENTITIES_RATE_LIMIT_MAX'
      )
    })
  })

  describe('and no trusted client IP header is set', () => {
    let env: Environment

    beforeEach(async () => {
      delete process.env.TRUSTED_CLIENT_IP_HEADER
      env = await new EnvironmentBuilder().build()
    })

    it('should leave it undefined so the limiter keys on the socket address', () => {
      expect(env.getConfig(EnvironmentConfig.TRUSTED_CLIENT_IP_HEADER)).toBeUndefined()
    })
  })

  describe('and the trusted client IP header is set with surrounding whitespace', () => {
    let env: Environment

    beforeEach(async () => {
      process.env.TRUSTED_CLIENT_IP_HEADER = '  x-real-ip  '
      env = await new EnvironmentBuilder().build()
    })

    it('should trim it, since Headers.get rejects a padded name outright', () => {
      expect(env.getConfig(EnvironmentConfig.TRUSTED_CLIENT_IP_HEADER)).toBe('x-real-ip')
    })
  })

  describe('and the trusted client IP header is set to an empty string', () => {
    let env: Environment

    beforeEach(async () => {
      process.env.TRUSTED_CLIENT_IP_HEADER = '   '
      env = await new EnvironmentBuilder().build()
    })

    it('should treat it as unset rather than pass a blank name the limiter would reject', () => {
      expect(env.getConfig(EnvironmentConfig.TRUSTED_CLIENT_IP_HEADER)).toBeUndefined()
    })
  })

  describe('and the trusted client IP header is not a valid HTTP header name', () => {
    beforeEach(() => {
      process.env.TRUSTED_CLIENT_IP_HEADER = 'x real ip'
    })

    it('should fail at startup rather than throw on every POST /entities request', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow('Invalid TRUSTED_CLIENT_IP_HEADER')
    })
  })
})

describe('when a client posts entities through the rate limit middleware', () => {
  let rateLimiter: IRateLimiterComponent<GlobalContext>
  let middleware: IHttpServerComponent.IRequestHandler<any>
  let next: jest.Mock
  let max: number

  /** Drives the middleware the way the router does, with the route the limiter buckets on. */
  const post = (remoteAddress: string | undefined, headers: Record<string, string> = {}) =>
    middleware({
      request: new Request('http://localhost/entities', { method: 'POST', headers }),
      url: new URL('http://localhost/entities'),
      routerPath: '/entities',
      remoteAddress,
      components: {} as any,
      params: {}
    } as any, next as any)

  beforeEach(() => {
    max = 3
    next = jest.fn().mockResolvedValue({ status: 200 })
    rateLimiter = createRateLimiterComponent<GlobalContext>(
      {
        cache: createInMemoryCacheComponent({ max: 100 }),
        logs: createSilentLogs() as any,
        metrics: createTestMetricsComponent(metricsDeclaration) as any
      },
      {
        keyPrefix: 'catalyst-content:rl',
        max,
        windowSeconds: 60,
        buildLimitExceededResponse: () => ({ status: 429, body: { error: 'Too many requests' } })
      }
    )
    middleware = rateLimiter.withRateLimitMiddleware() as any
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('and the client stays within its budget', () => {
    let statuses: number[]

    beforeEach(async () => {
      statuses = []
      for (let i = 0; i < max; i++) {
        statuses.push(((await post('203.0.113.7')) as any).status)
      }
    })

    it('should run the deployment handler for every request', () => {
      expect([statuses, next.mock.calls.length]).toEqual([[200, 200, 200], max])
    })
  })

  describe('and the client exceeds its budget', () => {
    let lastResponse: any

    beforeEach(async () => {
      for (let i = 0; i < max; i++) {
        await post('203.0.113.7')
      }
      lastResponse = await post('203.0.113.7')
    })

    it('should respond with a 429 and never reach the deployment handler', () => {
      expect([lastResponse.status, next.mock.calls.length]).toEqual([429, max])
    })

    // `headers` is a `Headers` instance, not a plain object, so it must be read with `.get()`.
    it('should send a Retry-After the client can back off on', () => {
      expect(Number(lastResponse.headers.get('Retry-After'))).toBeGreaterThan(0)
    })

    it('should use the same error response shape as the rest of the Catalyst API', () => {
      expect(lastResponse.body).toEqual({ error: 'Too many requests' })
    })
  })

  describe('and a second client posts after the first is exhausted', () => {
    let response: any

    beforeEach(async () => {
      for (let i = 0; i < max + 1; i++) {
        await post('203.0.113.7')
      }
      response = await post('198.51.100.4')
    })

    it('should give that client its own budget rather than the first client sharing it away', () => {
      expect(response.status).toBe(200)
    })
  })

  describe('and the requests carry no client address at all', () => {
    let statuses: number[]

    beforeEach(async () => {
      statuses = []
      // fallbackMaxDivisor defaults to 10, so max(1, floor(3/10)) === 1 request per window.
      for (let i = 0; i < 2; i++) {
        statuses.push(((await post(undefined)) as any).status)
      }
    })

    it('should share one bucket at a tightened cap rather than grant the full limit', () => {
      expect(statuses).toEqual([200, 429])
    })
  })
})

describe('when the catalyst sits behind a proxy that sets a trusted client IP header', () => {
  let rateLimiter: IRateLimiterComponent<GlobalContext>
  let middleware: IHttpServerComponent.IRequestHandler<any>
  let next: jest.Mock

  const postFromProxy = (clientIp: string) =>
    middleware({
      request: new Request('http://localhost/entities', {
        method: 'POST',
        headers: { 'x-real-ip': clientIp }
      }),
      url: new URL('http://localhost/entities'),
      routerPath: '/entities',
      // Every request arrives from the proxy, so the socket address is useless for keying.
      remoteAddress: '172.18.0.2',
      components: {} as any,
      params: {}
    } as any, next as any)

  beforeEach(() => {
    next = jest.fn().mockResolvedValue({ status: 200 })
    rateLimiter = createRateLimiterComponent<GlobalContext>(
      {
        cache: createInMemoryCacheComponent({ max: 100 }),
        logs: createSilentLogs() as any,
        metrics: createTestMetricsComponent(metricsDeclaration) as any
      },
      {
        keyPrefix: 'catalyst-content:rl',
        trustedClientIpHeader: 'x-real-ip',
        max: 2,
        windowSeconds: 60,
        buildLimitExceededResponse: () => ({ status: 429, body: { error: 'Too many requests' } })
      }
    )
    middleware = rateLimiter.withRateLimitMiddleware() as any
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('and two different clients arrive through the same proxy', () => {
    let statuses: number[]

    beforeEach(async () => {
      statuses = []
      statuses.push(((await postFromProxy('203.0.113.7')) as any).status)
      statuses.push(((await postFromProxy('203.0.113.7')) as any).status)
      statuses.push(((await postFromProxy('203.0.113.7')) as any).status)
      statuses.push(((await postFromProxy('198.51.100.4')) as any).status)
    })

    it('should limit each client separately instead of collapsing them onto the proxy address', () => {
      expect(statuses).toEqual([200, 200, 429, 200])
    })
  })
})
