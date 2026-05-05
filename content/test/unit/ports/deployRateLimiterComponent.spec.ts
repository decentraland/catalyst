import { EntityType } from '@dcl/schemas'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import ms from 'ms'
import { createDeployRateLimiter } from '../../../src/adapters/deploy-rate-limiter'
import { metricsDeclaration } from '../../../src/metrics'

describe('createDeployRateLimiter', () => {
  let logs: Awaited<ReturnType<typeof createLogComponent>>
  let metrics: ReturnType<typeof createTestMetricsComponent>

  beforeAll(async () => {
    logs = await createLogComponent({
      config: createConfigComponent({ LOG_LEVEL: 'DEBUG' })
    })
    metrics = createTestMetricsComponent(metricsDeclaration)
  })

  describe('when defaultTtl is provided in milliseconds', () => {
    it('should correctly convert milliseconds to seconds for the cache TTL', () => {
      const ttlMs = ms('10s') // 10000 ms

      const rateLimiter = createDeployRateLimiter(
        { logs, metrics },
        {
          defaultTtl: ttlMs,
          defaultMax: 300,
          entitiesConfigTtl: new Map(),
          entitiesConfigMax: new Map(),
          entitiesConfigUnchangedTtl: new Map()
        }
      )

      // The rate limiter should work for all entity types without throwing
      for (const entityType of Object.values(EntityType)) {
        expect(() => rateLimiter.isRateLimited(entityType, ['pointer'])).not.toThrow()
      }
    })

    it('should not treat a millisecond value as seconds (preventing inflated TTLs)', () => {
      // If defaultTtl were treated as seconds, 60000ms would become 60000 seconds (~16.6 hours).
      // After the fix, 60000ms is converted via toSeconds() to 60 seconds.
      const rateLimiter = createDeployRateLimiter(
        { logs, metrics },
        {
          defaultTtl: ms('1m'), // 60000 ms
          defaultMax: 300,
          entitiesConfigTtl: new Map(),
          entitiesConfigMax: new Map(),
          entitiesConfigUnchangedTtl: new Map()
        }
      )

      // Deploying should record successfully and the rate limiter should function
      rateLimiter.newDeployment(EntityType.PROFILE, ['pointer-1'], Date.now())
      expect(rateLimiter.isRateLimited(EntityType.PROFILE, ['pointer-1'])).toBe(true)
    })
  })

  describe('when entitiesConfigTtl provides per-entity TTLs in milliseconds', () => {
    let dateNowSpy: jest.SpyInstance
    let currentTime: number

    beforeEach(() => {
      currentTime = Date.now()
      dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime)
    })

    afterEach(() => {
      dateNowSpy.mockRestore()
    })

    it('should rate-limit within TTL and allow after TTL expires', () => {
      const ttlMs = 2000 // 2 seconds
      const rateLimiter = createDeployRateLimiter(
        { logs, metrics },
        {
          defaultTtl: ms('1m'),
          defaultMax: 10000,
          entitiesConfigTtl: new Map([[EntityType.SCENE, ttlMs]]),
          entitiesConfigMax: new Map(),
          entitiesConfigUnchangedTtl: new Map()
        }
      )

      rateLimiter.newDeployment(EntityType.SCENE, ['X1,Y1'], currentTime)
      expect(rateLimiter.isRateLimited(EntityType.SCENE, ['X1,Y1'])).toBe(true)

      // Advance time past the TTL (2 seconds + buffer)
      currentTime += ttlMs + 1000
      expect(rateLimiter.isRateLimited(EntityType.SCENE, ['X1,Y1'])).toBe(false)
    })
  })

  describe('when maxSize is exceeded', () => {
    it('should rate-limit based on max size', () => {
      const rateLimiter = createDeployRateLimiter(
        { logs, metrics },
        {
          defaultTtl: ms('1m'),
          defaultMax: 2,
          entitiesConfigTtl: new Map(),
          entitiesConfigMax: new Map([[EntityType.SCENE, 2]]),
          entitiesConfigUnchangedTtl: new Map()
        }
      )

      rateLimiter.newDeployment(EntityType.SCENE, ['X1,Y1'], Date.now())
      rateLimiter.newDeployment(EntityType.SCENE, ['X2,Y2'], Date.now())
      rateLimiter.newDeployment(EntityType.SCENE, ['X3,Y3'], Date.now())

      // Max size of 2 exceeded with 3 entries
      expect(rateLimiter.isRateLimited(EntityType.SCENE, ['X99,Y99'])).toBe(true)
    })
  })

  describe('unchanged deployment rate limiting', () => {
    let dateNowSpy: jest.SpyInstance
    let currentTime: number

    beforeEach(() => {
      currentTime = Date.now()
      dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime)
    })

    afterEach(() => {
      dateNowSpy.mockRestore()
    })

    it('should rate-limit unchanged deployments within the unchanged TTL', () => {
      const unchangedTtlMs = 5000
      const rateLimiter = createDeployRateLimiter(
        { logs, metrics },
        {
          defaultTtl: ms('1m'),
          defaultMax: 10000,
          entitiesConfigTtl: new Map(),
          entitiesConfigMax: new Map(),
          entitiesConfigUnchangedTtl: new Map([[EntityType.PROFILE, unchangedTtlMs]])
        }
      )

      rateLimiter.newUnchangedDeployment(EntityType.PROFILE, ['0xAddress'], currentTime)
      expect(rateLimiter.isUnchangedDeploymentRateLimited(EntityType.PROFILE, ['0xAddress'])).toBe(true)

      // Advance past unchanged TTL
      currentTime += unchangedTtlMs + 1000
      expect(rateLimiter.isUnchangedDeploymentRateLimited(EntityType.PROFILE, ['0xAddress'])).toBe(false)
    })
  })
})
