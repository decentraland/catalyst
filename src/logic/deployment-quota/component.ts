import { createInMemoryCacheComponent } from '@dcl/memory-cache-component'
import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { DeploymentQuotaExceededError } from './errors'
import { IDeploymentQuotaComponent } from './types'

const WINDOW_SECONDS = 86400
// Bounds the exhausted-source markers like the rate limiter bounds its counters.
const MAX_EXHAUSTED_SOURCES = 50_000

/**
 * Creates the daily regular-deployment quota.
 * @param components Environment and the rate limiter that counts deployments.
 * @returns The deployment quota.
 */
export function createDeploymentQuota(
  components: Pick<AppComponents, 'env' | 'rateLimiter'>
): IDeploymentQuotaComponent {
  const { env, rateLimiter } = components
  const policy = {
    name: '/entities daily-quota',
    max: env.getConfig<number>(EnvironmentConfig.POST_ENTITIES_DAILY_QUOTA_MAX),
    windowSeconds: WINDOW_SECONDS
  }
  // Source -> when its window resets (epoch ms), for sources with nothing left in that window.
  const exhaustedUntil = createInMemoryCacheComponent({ max: MAX_EXHAUSTED_SOURCES })

  function secondsUntil(resetAt: number): number {
    return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
  }

  async function assertAvailable(source: string): Promise<void> {
    const resetAt = await exhaustedUntil.get<number>(source)
    if (resetAt !== null && resetAt > Date.now()) {
      throw new DeploymentQuotaExceededError(secondsUntil(resetAt))
    }
  }

  async function consume(source: string): Promise<void> {
    const result = await rateLimiter.consume(source, policy)
    // A degraded count is not a real one: never mark a source exhausted on it.
    if (!result.storeUnavailable && result.remaining === 0) {
      await exhaustedUntil.set(source, result.resetAt, secondsUntil(result.resetAt))
    }
    if (!result.allowed) {
      throw new DeploymentQuotaExceededError(result.retryAfterSeconds)
    }
  }

  return { assertAvailable, consume }
}
