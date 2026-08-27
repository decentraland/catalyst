import { ICacheStorageComponent } from '@dcl/core-commons'
import {
  FALLBACK_IDENTITY,
  buildCounterKey,
  currentWindow,
  encodeIdentity,
  windowOffsetFor
} from '@dcl/rate-limiter-component'
import { QuotaCountResult } from './types'

/** Namespaces every counter, so nothing else sharing the cache can collide with one. */
export const QUOTA_KEY_PREFIX = 'catalyst-content:deploy-quota'

/**
 * Divisor applied to the budget when no client address could be established and every such caller
 * shares one bucket. Mirrors the rate limiter's own default: the shared bucket is a global quota, so
 * leaving the full budget there would let the first callers of each window spend it and throttle
 * everyone else anyway. Tightening makes a misconfigured deployment fail small instead of funnelling
 * all anonymous traffic through the full per-client cap.
 */
export const FALLBACK_MAX_DIVISOR = 10

/** Extra second so a counter can never expire before the window it belongs to ends. */
const COUNTER_TTL_GRACE_SECONDS = 1

/**
 * Counts one attempt against `identity` in a fixed window and reports whether it fits.
 *
 * Written against the cache rather than `IRateLimiterComponent.consume`, which rejects any window
 * longer than a day as a seconds/milliseconds mix-up and therefore cannot express the week tier. The
 * window arithmetic, key layout and identity encoding are still the limiter's own exported ones, so
 * the two agree on all of it and a counter written here is readable there.
 *
 * An empty `identity` means the caller could not establish one; it is counted in a shared bucket at
 * the tightened cap rather than given a bucket of its own at the full budget.
 *
 * Never throws for a counter failure: the quota is abuse mitigation, and an unreachable counter must
 * not stop deployments. The result says so through `storeUnavailable`.
 */
export async function countAttempt(
  cache: Pick<ICacheStorageComponent, 'increment'>,
  bucket: string,
  identity: string,
  max: number,
  windowSeconds: number,
  now: number
): Promise<QuotaCountResult> {
  const isShared = identity.trim().length === 0
  const limit = isShared ? Math.max(1, Math.floor(max / FALLBACK_MAX_DIVISOR)) : max
  const countedIdentity = isShared ? FALLBACK_IDENTITY : identity

  const windowMs = windowSeconds * 1000
  // Phase the window per identity: a boundary shared by everyone is one a caller could compute from a
  // single Retry-After and then spend a full budget on each side of.
  const { windowId, resetAt } = currentWindow(now, windowMs, windowOffsetFor(countedIdentity, windowMs))
  const secondsLeftInWindow = Math.max(1, Math.ceil((resetAt - now) / 1000))

  const key = buildCounterKey(QUOTA_KEY_PREFIX, bucket, windowId, encodeIdentity(countedIdentity, false))

  try {
    const { value } = await cache.increment(key, {
      ttlInSeconds: secondsLeftInWindow + COUNTER_TTL_GRACE_SECONDS
    })
    return {
      allowed: value <= limit,
      limit,
      // Never 0: some clients read `Retry-After: 0` as "retry now", the storm the header prevents.
      retryAfterSeconds: secondsLeftInWindow,
      storeUnavailable: false
    }
  } catch {
    return { allowed: true, limit, retryAfterSeconds: secondsLeftInWindow, storeUnavailable: true }
  }
}
