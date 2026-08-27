import { EntityType } from '@dcl/schemas'
import { createInMemoryCacheComponent } from '@dcl/memory-cache-component'
import { canonicalizeIpAddress, clientIpFromForwardedHeader } from '@dcl/rate-limiter-component'
import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { countAttempt } from './counter'
import { DeploymentQuotaExceededError } from './errors'
import {
  DEPLOYMENT_QUOTA_WINDOWS,
  DEPLOYMENT_QUOTA_WINDOW_SECONDS,
  assertMonotonicQuotaLadder,
  budgetFor,
  isExemptIp,
  parseIpExemptions
} from './logic'
import {
  DeploymentQuotaLadder,
  DeploymentQuotaOutcome,
  DeploymentQuotaWindow,
  IDeploymentQuota,
  QuotaClient
} from './types'

/** Mirrors the package default the POST /entities limiter runs with, so both read the same hop. */
const TRUSTED_PROXY_COUNT = 1

/**
 * Bounds how much one client address can deploy of a given entity type over a minute, an hour, a day
 * and a week.
 *
 * The existing guards do not cover this: `POST_ENTITIES_RATE_LIMIT_*` is a per-client *request*
 * budget over a single 60s window and is blind to entity type, and `DEPLOYMENT_RATE_LIMIT_*` throttles
 * redeployments of the same *pointer* rather than one caller's total.
 *
 * Counters live in a cache of this component's own. Sharing the request limiter's LRU would let
 * minute-window churn evict the week counters.
 */
export function createDeploymentQuota(components: Pick<AppComponents, 'env' | 'logs' | 'metrics'>): IDeploymentQuota {
  const { env, logs, metrics } = components
  const logger = logs.getLogger('deployment-quota')

  const ladder = readLadder(env)
  assertMonotonicQuotaLadder(ladder)
  const exemptions = parseIpExemptions(env.getConfig<string[]>(EnvironmentConfig.DEPLOYMENT_QUOTA_EXEMPT_IPS) ?? [])
  // Resolved here rather than by the rate limiter, whose address handling lives in its middleware.
  // Same header as the POST /entities limiter reads, so the two agree on who a client is.
  const trustedClientIpHeader = env
    .getConfig<string | undefined>(EnvironmentConfig.TRUSTED_CLIENT_IP_HEADER)
    ?.toLowerCase()

  const cache = createInMemoryCacheComponent({
    max: env.getConfig<number>(EnvironmentConfig.DEPLOYMENT_QUOTA_CACHE_MAX_KEYS),
    // Every counter carries the TTL of its own window; a cache-wide default would only mask a missing
    // one, and the week's counter must outlive the one-hour library default.
    ttl: 0
  })

  // Failing open is silent by construction, so say it once when it starts happening. The metric's
  // `degraded` outcome carries the rest.
  let warnedAboutUnavailableCounter = false

  logger.info(`Deployment quota per client address:\n${describeLadder(ladder)}`, {
    exemptAddresses: exemptions.length
  })

  /** Same precedence as the limiter's own middleware: trusted header, then the socket address. */
  function resolveClientIp(client: QuotaClient): string | null {
    if (trustedClientIpHeader) {
      const fromHeader = clientIpFromForwardedHeader(
        client.request.headers.get(trustedClientIpHeader),
        TRUSTED_PROXY_COUNT
      )
      if (fromHeader) {
        return fromHeader
      }
    }
    return canonicalizeIpAddress(client.remoteAddress)
  }

  return {
    async assertWithinQuota(client: QuotaClient, entityType: EntityType): Promise<void> {
      const clientIp = resolveClientIp(client)
      if (clientIp !== null && isExemptIp(clientIp, exemptions)) {
        return
      }

      // An empty identity lands in `countAttempt`'s shared bucket at a tightened cap, which is what
      // the rate limiter does with a request carrying no client address.
      const identity = clientIp === null ? '' : `${entityType}:${clientIp}`

      const now = Date.now()
      for (const window of DEPLOYMENT_QUOTA_WINDOWS) {
        const result = await countAttempt(
          cache,
          `deploy-quota-${window}`,
          identity,
          budgetFor(ladder, window, entityType),
          DEPLOYMENT_QUOTA_WINDOW_SECONDS[window],
          now
        )

        // Reported, not logged: a throttled client retries, so a line per rejection is write
        // amplification driven by the abuse being blocked.
        metrics.increment('dcl_content_deployment_quota_attempts_total', {
          entity_type: entityType,
          window,
          outcome: result.storeUnavailable
            ? DeploymentQuotaOutcome.DEGRADED
            : result.allowed
            ? DeploymentQuotaOutcome.ALLOWED
            : DeploymentQuotaOutcome.LIMITED
        })

        if (result.storeUnavailable && !warnedAboutUnavailableCounter) {
          warnedAboutUnavailableCounter = true
          logger.warn(
            'The deployment quota counter is unavailable, so deployments are being allowed through ' +
              'uncounted. Watch the degraded outcome on dcl_content_deployment_quota_attempts_total.'
          )
        }

        if (!result.allowed) {
          // Stop at the first blown window, so a client that keeps retrying while throttled spends
          // only the budget it already blew and the longer horizons stay meaningful.
          //
          // `result.limit` rather than the configured budget, so a rejection in the shared bucket
          // reports the tightened cap it was actually measured against.
          throw new DeploymentQuotaExceededError(entityType, window, result.limit, result.retryAfterSeconds)
        }
      }
    }
  }
}

/**
 * Read inside the function rather than from a module-level table: `Environment` imports `components`,
 * which reaches this module, so `EnvironmentConfig` is still undefined while this module initializes.
 */
function readLadder(env: AppComponents['env']): DeploymentQuotaLadder {
  const configs: Record<DeploymentQuotaWindow, { max: EnvironmentConfig; perEntityType: EnvironmentConfig }> = {
    [DeploymentQuotaWindow.MINUTE]: {
      max: EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_MINUTE,
      perEntityType: EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_MINUTE_BY_ENTITY_TYPE
    },
    [DeploymentQuotaWindow.HOUR]: {
      max: EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_HOUR,
      perEntityType: EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_HOUR_BY_ENTITY_TYPE
    },
    [DeploymentQuotaWindow.DAY]: {
      max: EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_DAY,
      perEntityType: EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_DAY_BY_ENTITY_TYPE
    },
    [DeploymentQuotaWindow.WEEK]: {
      max: EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_WEEK,
      perEntityType: EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_WEEK_BY_ENTITY_TYPE
    }
  }

  const ladder = {} as DeploymentQuotaLadder
  for (const window of DEPLOYMENT_QUOTA_WINDOWS) {
    ladder[window] = {
      default: env.getConfig<number>(configs[window].max),
      perEntityType: env.getConfig<Map<EntityType, number>>(configs[window].perEntityType) ?? new Map()
    }
  }
  return ladder
}

function describeLadder(ladder: DeploymentQuotaLadder): string {
  return DEPLOYMENT_QUOTA_WINDOWS.map((window) => {
    const overrides = Array.from(ladder[window].perEntityType, ([entityType, max]) => `${entityType}: ${max}`)
    const detail = overrides.length > 0 ? ` (${overrides.join(', ')})` : ''
    return `${window}: ${ladder[window].default}${detail}`
  }).join('\n')
}
