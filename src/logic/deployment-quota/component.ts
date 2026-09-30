import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { DeploymentQuotaExceededError } from './errors'
import { IDeploymentQuotaComponent } from './types'

const WINDOW_SECONDS = 86400
// Outside the limiter's own `catalyst-content:rl:` namespace, so a marker can never be read as a counter.
const EXHAUSTED_KEY_PREFIX = 'catalyst-content:daily-quota-exhausted:'

/**
 * Creates the daily regular-deployment quota.
 * @param components Environment, logs, the rate limiter that counts deployments and its store, which
 * also keeps which sources have spent their quota so every instance sharing the counters agrees.
 * @returns The deployment quota.
 */
export function createDeploymentQuota(
  components: Pick<AppComponents, 'env' | 'logs' | 'rateLimiter' | 'rateLimitStore'>
): IDeploymentQuotaComponent {
  const { env, logs, rateLimiter, rateLimitStore } = components
  const logger = logs.getLogger('deployment-quota')
  const policy = {
    name: '/entities daily-quota',
    max: env.getConfig<number>(EnvironmentConfig.POST_ENTITIES_DAILY_QUOTA_MAX),
    windowSeconds: WINDOW_SECONDS
  }

  function secondsUntil(resetAt: number): number {
    return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
  }

  function warnStoreUnavailable(error: unknown): void {
    logger.warn('The exhausted-quota marker store is unavailable; checking the quota after the body instead', {
      error: error instanceof Error ? error.message : String(error)
    })
  }

  async function assertAvailable(source: string): Promise<void> {
    let resetAt: number | null
    try {
      resetAt = await rateLimitStore.get<number>(EXHAUSTED_KEY_PREFIX + source)
    } catch (error) {
      // Fails open like the limiter: the post-parse count still applies.
      warnStoreUnavailable(error)
      return
    }
    if (resetAt !== null && resetAt > Date.now()) {
      throw new DeploymentQuotaExceededError(secondsUntil(resetAt))
    }
  }

  async function consume(source: string): Promise<void> {
    const result = await rateLimiter.consume(source, policy)
    // A degraded count is not a real one: never mark a source exhausted on it.
    if (!result.storeUnavailable && result.remaining === 0) {
      try {
        await rateLimitStore.set(EXHAUSTED_KEY_PREFIX + source, result.resetAt, secondsUntil(result.resetAt))
      } catch (error) {
        warnStoreUnavailable(error)
      }
    }
    if (!result.allowed) {
      throw new DeploymentQuotaExceededError(result.retryAfterSeconds)
    }
  }

  return { assertAvailable, consume }
}
