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

describe('when using the daily deployment quota', () => {
  let consume: jest.Mock
  let quota: IDeploymentQuotaComponent
  let admission: unknown

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW)
    consume = jest.fn()
    quota = createDeploymentQuota({
      env: {
        getConfig: (key: EnvironmentConfig) => (key === EnvironmentConfig.POST_ENTITIES_DAILY_QUOTA_MAX ? 2 : undefined)
      },
      rateLimiter: { consume }
    } as any)
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
