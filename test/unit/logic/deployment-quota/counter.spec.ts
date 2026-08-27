import { ICacheStorageComponent } from '@dcl/core-commons'
import { createInMemoryCacheComponent } from '@dcl/memory-cache-component'
import { FALLBACK_MAX_DIVISOR, countAttempt } from '../../../../src/logic/deployment-quota'
import { QuotaCountResult } from '../../../../src/logic/deployment-quota/types'

const MINUTE_SECONDS = 60
const WEEK_SECONDS = 7 * 24 * 60 * 60
const NOW = 1_780_000_000_000

describe('when counting an attempt against a window', () => {
  let cache: ICacheStorageComponent

  beforeEach(() => {
    cache = createInMemoryCacheComponent({ max: 100, ttl: 0 })
  })

  describe('and the identity is under its budget', () => {
    let results: QuotaCountResult[]

    beforeEach(async () => {
      results = [
        await countAttempt(cache, 'minute', 'scene:203.0.113.7', 2, MINUTE_SECONDS, NOW),
        await countAttempt(cache, 'minute', 'scene:203.0.113.7', 2, MINUTE_SECONDS, NOW)
      ]
    })

    it('should allow every attempt up to the budget', () => {
      expect(results.map((result) => result.allowed)).toEqual([true, true])
    })
  })

  describe('and the identity goes one over its budget', () => {
    let result: QuotaCountResult

    beforeEach(async () => {
      await countAttempt(cache, 'minute', 'scene:203.0.113.7', 1, MINUTE_SECONDS, NOW)
      result = await countAttempt(cache, 'minute', 'scene:203.0.113.7', 1, MINUTE_SECONDS, NOW)
    })

    it('should reject it against the configured budget', () => {
      expect(result).toMatchObject({ allowed: false, limit: 1, storeUnavailable: false })
    })

    it('should ask the caller to retry no later than the end of the window', () => {
      expect(result.retryAfterSeconds).toBeGreaterThan(0)
    })

    it('should never ask the caller to retry immediately', () => {
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(MINUTE_SECONDS)
    })
  })

  describe('and the same identity is counted in two different buckets', () => {
    let results: QuotaCountResult[]

    beforeEach(async () => {
      await countAttempt(cache, 'minute', 'scene:203.0.113.7', 1, MINUTE_SECONDS, NOW)
      results = [
        await countAttempt(cache, 'minute', 'scene:203.0.113.7', 1, MINUTE_SECONDS, NOW),
        await countAttempt(cache, 'week', 'scene:203.0.113.7', 1, WEEK_SECONDS, NOW)
      ]
    })

    it('should hold a counter per bucket, so one window does not spend another', () => {
      expect(results.map((result) => result.allowed)).toEqual([false, true])
    })
  })

  describe('and the window is longer than the rate limiter would accept', () => {
    let result: QuotaCountResult

    beforeEach(async () => {
      result = await countAttempt(cache, 'week', 'scene:203.0.113.7', 1, WEEK_SECONDS, NOW)
    })

    it('should still count it, which is why the counting is not delegated to consume()', () => {
      expect(result).toMatchObject({ allowed: true, storeUnavailable: false })
    })

    it('should hold the retry delay inside the week it belongs to', () => {
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(WEEK_SECONDS)
    })
  })

  describe('and two identities are counted in the same bucket', () => {
    let results: QuotaCountResult[]

    beforeEach(async () => {
      await countAttempt(cache, 'minute', 'scene:203.0.113.7', 1, MINUTE_SECONDS, NOW)
      results = [
        await countAttempt(cache, 'minute', 'scene:203.0.113.7', 1, MINUTE_SECONDS, NOW),
        await countAttempt(cache, 'minute', 'scene:198.51.100.1', 1, MINUTE_SECONDS, NOW)
      ]
    })

    it('should hold a counter per identity', () => {
      expect(results.map((result) => result.allowed)).toEqual([false, true])
    })
  })

  describe('and the identity is empty because no client address could be established', () => {
    let results: QuotaCountResult[]

    beforeEach(async () => {
      results = []
      for (let attempt = 0; attempt < FALLBACK_MAX_DIVISOR + 1; attempt++) {
        results.push(await countAttempt(cache, 'minute', '', 100, MINUTE_SECONDS, NOW))
      }
    })

    it('should measure it against the budget tightened by the fallback divisor', () => {
      expect(results[results.length - 1]).toMatchObject({ allowed: false, limit: 10 })
    })
  })

  describe('and a budget too small to divide lands in the shared bucket', () => {
    let result: QuotaCountResult

    beforeEach(async () => {
      result = await countAttempt(cache, 'minute', '   ', 5, MINUTE_SECONDS, NOW)
    })

    it('should floor the tightened cap at one rather than at zero, which would reject everything', () => {
      expect(result).toMatchObject({ allowed: true, limit: 1 })
    })
  })

  describe('and the counter cannot be written', () => {
    let result: QuotaCountResult
    let increment: jest.Mock

    beforeEach(async () => {
      increment = jest.fn().mockRejectedValue(new Error('the counter store is unreachable'))
      result = await countAttempt({ increment }, 'minute', 'scene:203.0.113.7', 1, MINUTE_SECONDS, NOW)
    })

    afterEach(() => {
      jest.clearAllMocks()
    })

    it('should fail open, since an unreachable counter must not stop deployments', () => {
      expect(result).toMatchObject({ allowed: true, storeUnavailable: true })
    })
  })

  describe('and a window boundary is being approached', () => {
    let result: QuotaCountResult

    beforeEach(async () => {
      // Any instant inside the window: the phase is derived from the identity, so the test cannot pick
      // the boundary, only assert the delay stays inside one window's length.
      result = await countAttempt(cache, 'minute', 'scene:203.0.113.7', 1, MINUTE_SECONDS, NOW + 59_999)
    })

    it('should never report a delay of zero seconds', () => {
      expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1)
    })
  })
})
