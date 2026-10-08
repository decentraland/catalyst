import { ICacheStorageComponent } from '@dcl/core-commons'
import { createInMemoryCacheComponent } from '@dcl/memory-cache-component'
import { RateLimitKeySource, RateLimitResult } from '@dcl/rate-limiter-component'
import { EnvironmentConfig } from '../../../src/Environment'
import {
  createDeploymentQuota,
  DeploymentQuotaExceededError,
  IDeploymentQuotaComponent
} from '../../../src/logic/deployment-quota'

const NOW = 1_700_000_000_000
const RESET_AT = NOW + 3600 * 1000

const COUNTED: RateLimitResult = {
  allowed: true,
  limit: 2,
  remaining: 1,
  retryAfterSeconds: 3600,
  resetAt: RESET_AT,
  firstRejectionInWindow: false,
  storeUnavailable: false,
  keySource: RateLimitKeySource.CUSTOM,
  identity: '203.0.113.1',
  bucket: '/entities daily-quota'
}

function buildQuota(consume: jest.Mock, rateLimitStore: ICacheStorageComponent): IDeploymentQuotaComponent {
  return createDeploymentQuota({
    env: {
      getConfig: (key: EnvironmentConfig) => (key === EnvironmentConfig.POST_ENTITIES_DAILY_QUOTA_MAX ? 2 : undefined)
    },
    logs: { getLogger: () => ({ warn: jest.fn() }) },
    rateLimiter: { consume },
    rateLimitStore
  } as any)
}

describe('when using the daily deployment quota', () => {
  let consume: jest.Mock
  let rateLimitStore: ICacheStorageComponent
  let quota: IDeploymentQuotaComponent
  let admission: unknown

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW)
    consume = jest.fn()
    rateLimitStore = createInMemoryCacheComponent({ max: 100 })
    quota = buildQuota(consume, rateLimitStore)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('and the source has deployments left after a deployment', () => {
    beforeEach(async () => {
      consume.mockResolvedValueOnce({ ...COUNTED, remaining: 1 })
      await quota.consume('203.0.113.1')
      admission = await quota.assertAvailable('203.0.113.1').catch((e) => e)
    })

    it('should count it against the daily policy and keep admitting the source', () => {
      expect({ policy: consume.mock.calls[0], admission }).toEqual({
        policy: ['203.0.113.1', { name: '/entities daily-quota', max: 2, windowSeconds: 86400 }],
        admission: undefined
      })
    })
  })

  describe('and a deployment spends the last of the source allowance', () => {
    beforeEach(async () => {
      consume.mockResolvedValueOnce({ ...COUNTED, remaining: 0 })
      await quota.consume('203.0.113.1')
      admission = await quota.assertAvailable('203.0.113.1').catch((e) => e)
    })

    it('should turn the source away until its window resets, without counting', () => {
      expect({ admission, counted: consume.mock.calls.length }).toEqual({
        admission: new DeploymentQuotaExceededError(3600),
        counted: 1
      })
    })
  })

  describe('and another instance sharing the counter store spent the source allowance', () => {
    beforeEach(async () => {
      consume.mockResolvedValueOnce({ ...COUNTED, remaining: 0 })
      await buildQuota(consume, rateLimitStore).consume('203.0.113.1')
      admission = await quota.assertAvailable('203.0.113.1').catch((e) => e)
    })

    it('should turn the source away here too', () => {
      expect(admission).toEqual(new DeploymentQuotaExceededError(3600))
    })
  })

  describe('and the store cannot record that the source is spent', () => {
    let error: unknown

    beforeEach(async () => {
      jest.spyOn(rateLimitStore, 'set').mockRejectedValueOnce(new Error('store down'))
      consume.mockResolvedValueOnce({ ...COUNTED, remaining: 0 })
      error = await quota.consume('203.0.113.1').catch((e) => e)
    })

    it('should still count the deployment as allowed', () => {
      expect(error).toBeUndefined()
    })
  })

  describe('and the store cannot be read before the body', () => {
    beforeEach(async () => {
      consume.mockResolvedValueOnce({ ...COUNTED, remaining: 0 })
      await quota.consume('203.0.113.1')
      jest.spyOn(rateLimitStore, 'get').mockRejectedValueOnce(new Error('store down'))
      admission = await quota.assertAvailable('203.0.113.1').catch((e) => e)
    })

    it('should admit the source and leave the decision to the count after the body, as the limiter fails open', () => {
      expect(admission).toBeUndefined()
    })
  })

  describe('and the source window has reset since it was spent', () => {
    beforeEach(async () => {
      consume.mockResolvedValueOnce({ ...COUNTED, remaining: 0 })
      await quota.consume('203.0.113.1')
      jest.spyOn(Date, 'now').mockReturnValue(RESET_AT)
      admission = await quota.assertAvailable('203.0.113.1').catch((e) => e)
    })

    it('should admit the source again', () => {
      expect(admission).toBeUndefined()
    })
  })

  describe('and another source spent its allowance', () => {
    beforeEach(async () => {
      consume.mockResolvedValueOnce({ ...COUNTED, remaining: 0 })
      await quota.consume('203.0.113.1')
      admission = await quota.assertAvailable('203.0.113.2').catch((e) => e)
    })

    it('should keep admitting this source', () => {
      expect(admission).toBeUndefined()
    })
  })

  describe('and the counter store is unavailable', () => {
    beforeEach(async () => {
      consume.mockResolvedValueOnce({ ...COUNTED, remaining: 0, storeUnavailable: true })
      await quota.consume('203.0.113.1')
      admission = await quota.assertAvailable('203.0.113.1').catch((e) => e)
    })

    it('should not mark the source as spent on the degraded count', () => {
      expect(admission).toBeUndefined()
    })
  })

  describe('and a deployment exceeds the source allowance', () => {
    let error: unknown

    beforeEach(async () => {
      consume.mockResolvedValueOnce({ ...COUNTED, allowed: false, remaining: 0, retryAfterSeconds: 120 })
      error = await quota.consume('203.0.113.1').catch((e) => e)
    })

    it('should reject it with the time left until the window resets', () => {
      expect(error).toEqual(new DeploymentQuotaExceededError(120))
    })
  })
})
