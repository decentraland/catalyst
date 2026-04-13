import { EntityType } from '@dcl/schemas'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import ms from 'ms'
import { createDeployRateLimiter } from '../../../src/ports/deployRateLimiterComponent'
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

  describe('when deploying to the same pointer within the TTL', () => {
    it('should rate-limit the second deployment', async () => {
      const rateLimiter = createDeployRateLimiter(
        { logs, metrics },
        {
          defaultTtl: ms('1m'),
          defaultMax: 10000,
          entitiesConfigTtl: new Map([[EntityType.SCENE, ms('10s')]]),
          entitiesConfigMax: new Map(),
          entitiesConfigUnchangedTtl: new Map()
        }
      )

      await rateLimiter.newDeployment(EntityType.SCENE, ['X1,Y1'], Date.now())
      expect(await rateLimiter.isRateLimited(EntityType.SCENE, ['X1,Y1'])).toBe(true)
    })
  })

  describe('when a pointer has not been deployed recently', () => {
    it('should not rate-limit', async () => {
      const rateLimiter = createDeployRateLimiter(
        { logs, metrics },
        {
          defaultTtl: ms('1m'),
          defaultMax: 10000,
          entitiesConfigTtl: new Map(),
          entitiesConfigMax: new Map(),
          entitiesConfigUnchangedTtl: new Map()
        }
      )

      expect(await rateLimiter.isRateLimited(EntityType.SCENE, ['X1,Y1'])).toBe(false)
    })
  })

  describe('when the unchanged deployment TTL is active', () => {
    it('should rate-limit unchanged deployments', async () => {
      const rateLimiter = createDeployRateLimiter(
        { logs, metrics },
        {
          defaultTtl: ms('1m'),
          defaultMax: 10000,
          entitiesConfigTtl: new Map(),
          entitiesConfigMax: new Map(),
          entitiesConfigUnchangedTtl: new Map([[EntityType.PROFILE, ms('5m')]])
        }
      )

      await rateLimiter.newUnchangedDeployment(EntityType.PROFILE, ['0xAddress'], Date.now())
      expect(await rateLimiter.isUnchangedDeploymentRateLimited(EntityType.PROFILE, ['0xAddress'])).toBe(true)
    })
  })

  describe('when no unchanged deployment exists', () => {
    it('should not rate-limit', async () => {
      const rateLimiter = createDeployRateLimiter(
        { logs, metrics },
        {
          defaultTtl: ms('1m'),
          defaultMax: 10000,
          entitiesConfigTtl: new Map(),
          entitiesConfigMax: new Map(),
          entitiesConfigUnchangedTtl: new Map([[EntityType.PROFILE, ms('5m')]])
        }
      )

      expect(await rateLimiter.isUnchangedDeploymentRateLimited(EntityType.PROFILE, ['0xAddress'])).toBe(false)
    })
  })
})
