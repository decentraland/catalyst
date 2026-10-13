import { EntityType } from '@dcl/schemas'
import {
  createDeployRateLimiter,
  IDeployRateLimiterComponent
} from '../../../../src/logic/deployment-service/rate-limiter'

const NOW = 1_800_000_000_000
const WINDOW_MS = 20_000

describe('when computing how long a rate-limited deployment should wait', () => {
  let rateLimiter: IDeployRateLimiterComponent
  let retryAfter: number
  let now: number

  beforeEach(() => {
    now = NOW
    jest.spyOn(Date, 'now').mockImplementation(() => now)
    rateLimiter = createDeployRateLimiter(
      {
        logs: { getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) } as any,
        metrics: { observe: jest.fn(), increment: jest.fn() } as any
      },
      {
        defaultTtl: WINDOW_MS,
        defaultMax: 1000,
        entitiesConfigTtl: new Map([[EntityType.SCENE, WINDOW_MS]]),
        entitiesConfigMax: new Map([[EntityType.SCENE, 1000]]),
        entitiesConfigUnchangedTtl: new Map()
      }
    )
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('and its pointer was deployed 15 seconds into a 20 second window', () => {
    beforeEach(() => {
      rateLimiter.newDeployment(EntityType.SCENE, ['0,0'], NOW)
      now = NOW + 15_000
      retryAfter = rateLimiter.getRateLimitRetryAfterSeconds(EntityType.SCENE, ['0,0'])
    })

    it('should wait only the 5 seconds left', () => {
      expect(retryAfter).toBe(5)
    })
  })

  describe('and its pointers were deployed at different times', () => {
    beforeEach(() => {
      rateLimiter.newDeployment(EntityType.SCENE, ['0,0'], NOW)
      now = NOW + 8_000
      rateLimiter.newDeployment(EntityType.SCENE, ['0,1'], now)
      now = NOW + 10_000
      retryAfter = rateLimiter.getRateLimitRetryAfterSeconds(EntityType.SCENE, ['0,0', '0,1'])
    })

    it('should wait until the last of them clears', () => {
      expect(retryAfter).toBe(18)
    })
  })

  describe('and none of its pointers is limited', () => {
    beforeEach(() => {
      retryAfter = rateLimiter.getRateLimitRetryAfterSeconds(EntityType.SCENE, ['5,5'])
    })

    it('should wait one full window, the most a full cache takes to free', () => {
      expect(retryAfter).toBe(WINDOW_MS / 1000)
    })
  })
})
