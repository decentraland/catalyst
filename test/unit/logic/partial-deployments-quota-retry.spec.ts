import { secondsUntilCleanupFreesQuota } from '../../../src/logic/partial-deployments/component'

const NOW = 1_800_000_000_000
const TTL_MS = 24 * 60 * 60 * 1000
const INTERVAL_MS = 10 * 60 * 1000

describe('when computing the Retry-After of a partial-upload quota rejection', () => {
  let oldestCreatedAt: number | undefined
  let lastCleanupAt: number | undefined
  let retryAfter: number

  function compute(): number {
    return secondsUntilCleanupFreesQuota({
      now: NOW,
      oldestCreatedAt,
      ttlMs: TTL_MS,
      lastCleanupAt,
      cleanupIntervalMs: INTERVAL_MS
    })
  }

  describe('and the oldest charged upload has already expired', () => {
    beforeEach(() => {
      oldestCreatedAt = NOW - TTL_MS - 1000
    })

    describe('and the last cleanup ran four minutes ago', () => {
      beforeEach(() => {
        lastCleanupAt = NOW - 4 * 60 * 1000
        retryAfter = compute()
      })

      it('should wait for the next cleanup run', () => {
        expect(retryAfter).toBe(6 * 60)
      })
    })

    describe('and it expired before a cleanup run that is now overdue', () => {
      beforeEach(() => {
        oldestCreatedAt = NOW - TTL_MS - 20 * 60 * 1000
        lastCleanupAt = NOW - 15 * 60 * 1000
        retryAfter = compute()
      })

      it('should wait for the next scheduled run rather than one already past', () => {
        expect(retryAfter).toBe(5 * 60)
      })
    })

    describe('and no cleanup has run yet', () => {
      beforeEach(() => {
        lastCleanupAt = undefined
        retryAfter = compute()
      })

      it('should wait one cleanup interval from now', () => {
        expect(retryAfter).toBe(INTERVAL_MS / 1000)
      })
    })

    describe('and the next cleanup run is due right now', () => {
      beforeEach(() => {
        lastCleanupAt = NOW - INTERVAL_MS
        retryAfter = compute()
      })

      it('should still ask for at least one second', () => {
        expect(retryAfter).toBe(1)
      })
    })
  })

  describe('and the oldest charged upload expires in an hour', () => {
    beforeEach(() => {
      oldestCreatedAt = NOW - TTL_MS + 60 * 60 * 1000
      lastCleanupAt = NOW - 4 * 60 * 1000
      retryAfter = compute()
    })

    it('should wait for the first cleanup run after it expires', () => {
      // Runs at -4 min + k * 10 min; the first at or after +60 min is +66 min.
      expect(retryAfter).toBe(66 * 60)
    })
  })

  describe('and the oldest charged upload expires exactly at a cleanup run', () => {
    beforeEach(() => {
      lastCleanupAt = NOW - 4 * 60 * 1000
      oldestCreatedAt = lastCleanupAt + 3 * INTERVAL_MS - TTL_MS
      retryAfter = compute()
    })

    it('should wait for that run', () => {
      expect(retryAfter).toBe(26 * 60)
    })
  })

  describe('and no upload holds the quota', () => {
    beforeEach(() => {
      oldestCreatedAt = undefined
      lastCleanupAt = NOW - 4 * 60 * 1000
      retryAfter = compute()
    })

    it('should wait for the next cleanup run', () => {
      expect(retryAfter).toBe(6 * 60)
    })
  })
})
