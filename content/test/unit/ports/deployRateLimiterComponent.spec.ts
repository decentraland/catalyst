import { EntityType } from '@dcl/schemas'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import ms from 'ms'
import { createDeployRateLimiter, DeploymentRateLimitConfig } from '../../../src/ports/deployRateLimiterComponent'
import { metricsDeclaration } from '../../../src/metrics'

describe('deployRateLimiterComponent', () => {
  describe('when defaultTtl is provided in milliseconds', () => {
    let rateLimiter: ReturnType<typeof createDeployRateLimiter>
    let rateLimitConfig: DeploymentRateLimitConfig

    beforeEach(async () => {
      const logs = await createLogComponent({
        config: createConfigComponent({ LOG_LEVEL: 'DEBUG' })
      })
      const metrics = createTestMetricsComponent(metricsDeclaration)

      rateLimitConfig = {
        defaultTtl: ms('1m'),
        defaultMax: 300,
        entitiesConfigTtl: new Map(),
        entitiesConfigMax: new Map(),
        entitiesConfigUnchangedTtl: new Map()
      }

      rateLimiter = createDeployRateLimiter({ logs, metrics }, rateLimitConfig)
    })

    describe('and a deployment is made for an entity type without custom config', () => {
      let entityType: EntityType
      let pointers: string[]

      beforeEach(() => {
        entityType = EntityType.SCENE
        pointers = ['0,0']
        rateLimiter.newDeployment(entityType, pointers, Date.now())
      })

      it('should rate limit a subsequent deployment for the same pointer', () => {
        expect(rateLimiter.isRateLimited(entityType, pointers)).toBe(true)
      })

      it('should not rate limit a deployment for a different pointer', () => {
        expect(rateLimiter.isRateLimited(entityType, ['1,1'])).toBe(false)
      })
    })

    describe('and no deployment has been made', () => {
      it('should not rate limit the first deployment', () => {
        expect(rateLimiter.isRateLimited(EntityType.SCENE, ['0,0'])).toBe(false)
      })
    })
  })

  describe('when defaultTtl converts to a valid TTL in seconds', () => {
    let rateLimiter: ReturnType<typeof createDeployRateLimiter>

    beforeEach(async () => {
      const logs = await createLogComponent({
        config: createConfigComponent({ LOG_LEVEL: 'DEBUG' })
      })
      const metrics = createTestMetricsComponent(metricsDeclaration)

      const rateLimitConfig: DeploymentRateLimitConfig = {
        defaultTtl: ms('2m'),
        defaultMax: 300,
        entitiesConfigTtl: new Map(),
        entitiesConfigMax: new Map(),
        entitiesConfigUnchangedTtl: new Map()
      }

      rateLimiter = createDeployRateLimiter({ logs, metrics }, rateLimitConfig)
    })

    describe('and a deployment is registered', () => {
      let entityType: EntityType
      let pointers: string[]

      beforeEach(() => {
        entityType = EntityType.SCENE
        pointers = ['5,5']
        rateLimiter.newDeployment(entityType, pointers, Date.now())
      })

      it('should rate limit the pointer within the TTL window', () => {
        expect(rateLimiter.isRateLimited(entityType, pointers)).toBe(true)
      })
    })
  })
})
