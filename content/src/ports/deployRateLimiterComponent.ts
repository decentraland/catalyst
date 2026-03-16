import { ILoggerComponent } from '@well-known-components/interfaces'
import { EntityType } from '@dcl/schemas'
import ms from 'ms'
import NodeCache from 'node-cache'
import { AppComponents } from '../types'

export type IDeployRateLimiterComponent = {
  newDeployment(entityType: EntityType, pointers: string[], localTimestamp: number): void
  isRateLimited(entityType: EntityType, pointers: string[]): boolean
  newUnchangedDeployment(entityType: EntityType, pointers: string[], localTimestamp: number): void
  isUnchangedDeploymentRateLimited(entityType: EntityType, pointers: string[]): boolean
}

export type DeploymentRateLimitConfig = {
  defaultTtl: number
  defaultMax: number
  entitiesConfigTtl: Map<EntityType, number>
  entitiesConfigMax: Map<EntityType, number>
  entitiesConfigUnchangedTtl: Map<EntityType, number>
}

export function createDeployRateLimiter(
  components: Pick<AppComponents, 'logs' | 'metrics'>,
  rateLimitConfig: DeploymentRateLimitConfig
): IDeployRateLimiterComponent {
  const logs: ILoggerComponent.ILogger = components.logs.getLogger('DeployRateLimiterComponent')

  const deploymentCacheMap: Map<EntityType, { cache: NodeCache; maxSize: number }> = generateDeploymentCacheMap(
    logs,
    rateLimitConfig
  )

  const unchangedDeploymentCacheMap: Map<EntityType, NodeCache> = generateUnchangedDeploymentCacheMap(
    logs,
    rateLimitConfig
  )

  // Set static max size gauge for each entity type
  for (const [entityType, { maxSize }] of deploymentCacheMap) {
    components.metrics.observe('dcl_content_rate_limiter_cache_max_size', { entity_type: entityType }, maxSize)
  }

  function getCacheFromEntityType(entityType: EntityType): { cache: NodeCache; maxSize: number } {
    const cache = deploymentCacheMap.get(entityType)
    if (!cache) {
      throw new Error(`Invalid Entity Type: ${entityType}`)
    }
    return cache
  }

  function getUnchangedCacheFromEntityType(entityType: EntityType): NodeCache {
    const cache = unchangedDeploymentCacheMap.get(entityType)
    if (!cache) {
      throw new Error(`Invalid Entity Type: ${entityType}`)
    }
    return cache
  }

  return {
    newDeployment(entityType: EntityType, pointers: string[], localTimestamp: number): void {
      const cacheByEntityType = getCacheFromEntityType(entityType)
      for (const pointer of pointers) {
        cacheByEntityType.cache.set(pointer, localTimestamp)
      }
      components.metrics.observe(
        'dcl_content_rate_limiter_cache_keys',
        { entity_type: entityType, cache_type: 'deployment' },
        cacheByEntityType.cache.stats.keys
      )
    },

    /** Check if the entity should be rate limit: no deployment has been made for the same pointer in the last ttl
     * and no more than max size of deployments were made either   */
    isRateLimited(entityType: EntityType, pointers: string[]): boolean {
      const cacheByEntityType = getCacheFromEntityType(entityType)
      const ttlHit = pointers.some((p) => !!cacheByEntityType.cache.get(p))
      const maxSizeHit = cacheByEntityType.cache.stats.keys > cacheByEntityType.maxSize

      if (ttlHit || maxSizeHit) {
        components.metrics.increment('dcl_content_rate_limited_deployments_total', {
          entity_type: entityType,
          reason: ttlHit ? 'ttl' : 'max_size'
        })
      }

      return ttlHit || maxSizeHit
    },

    newUnchangedDeployment(entityType: EntityType, pointers: string[], localTimestamp: number): void {
      const cache = getUnchangedCacheFromEntityType(entityType)
      for (const pointer of pointers) {
        cache.set(pointer, localTimestamp)
      }
      components.metrics.observe(
        'dcl_content_rate_limiter_cache_keys',
        { entity_type: entityType, cache_type: 'unchanged' },
        cache.stats.keys
      )
    },

    isUnchangedDeploymentRateLimited(entityType: EntityType, pointers: string[]): boolean {
      const cache = getUnchangedCacheFromEntityType(entityType)
      const limited = pointers.some((p) => !!cache.get(p))
      if (limited) {
        components.metrics.increment('dcl_content_rate_limited_deployments_total', {
          entity_type: entityType,
          reason: 'unchanged_ttl'
        })
      }
      return limited
    }
  }
}

function generateUnchangedDeploymentCacheMap(
  logs: ILoggerComponent.ILogger,
  rateLimitConfig: DeploymentRateLimitConfig
): Map<EntityType, NodeCache> {
  const unchangedCacheMap: Map<EntityType, NodeCache> = new Map()

  for (const entityType of Object.values(EntityType)) {
    const ttl: number = toSeconds(rateLimitConfig.entitiesConfigUnchangedTtl.get(entityType) ?? 0)
    unchangedCacheMap.set(entityType, new NodeCache({ stdTTL: ttl, checkperiod: ttl }))
  }

  const configEntries: string[] = []
  for (const [entityType, cache] of unchangedCacheMap) {
    if (cache.options.stdTTL && cache.options.stdTTL > 0) {
      configEntries.push(`${entityType}: { unchanged_ttl: ${cache.options.stdTTL} }`)
    }
  }
  if (configEntries.length > 0) {
    logs.info(`Unchanged deployment rate limit configured for:\n${configEntries.join('\n')}`)
  }

  return unchangedCacheMap
}

function generateDeploymentCacheMap(
  logs: ILoggerComponent.ILogger,
  rateLimitConfig: DeploymentRateLimitConfig
): Map<EntityType, { cache: NodeCache; maxSize: number }> {
  const configPerEntityType: Map<EntityType, { max: number; ttl: number }> = getCacheConfigPerEntityMap(
    rateLimitConfig.entitiesConfigMax,
    rateLimitConfig.entitiesConfigTtl
  )

  const deploymentCacheMap: Map<EntityType, { cache: NodeCache; maxSize: number }> = new Map()

  for (const entityType of Object.values(EntityType)) {
    // The default is used in case a new entity type is created and it doesn't have a custom config
    const ttl: number = configPerEntityType.get(entityType)?.ttl ?? rateLimitConfig.defaultTtl
    const maxSize: number = configPerEntityType.get(entityType)?.max ?? rateLimitConfig.defaultMax

    deploymentCacheMap.set(entityType, {
      cache: new NodeCache({ stdTTL: ttl, checkperiod: ttl }),
      maxSize: maxSize
    })
  }
  logs.info(
    `Deployment Cache Map created to rate limit amount of deployments per entity with values: \n${toString(
      deploymentCacheMap
    )}`
  )

  return deploymentCacheMap
}

function toString(deploymentCacheMap: Map<EntityType, { cache: NodeCache; maxSize: number }>): string {
  const stringifyMap: string[] = []
  for (const entityType of deploymentCacheMap.keys()) {
    stringifyMap.push(
      `${entityType}: { ttl: ${deploymentCacheMap.get(entityType)?.cache.options.stdTTL}, max: ${
        deploymentCacheMap.get(entityType)?.maxSize
      } }`
    )
  }
  return stringifyMap.join('\n')
}

/**
 * Convert milliseconds to seconds for NodeCache stdTTL which expects seconds.
 */
function toSeconds(milliseconds: number): number {
  return Math.floor(milliseconds / 1000)
}

function getCacheConfigPerEntityMap(
  entitiesConfigMax: Map<EntityType, number>,
  entitiesConfigTtl: Map<EntityType, number>
): Map<EntityType, { max: number; ttl: number }> {
  return new Map([
    [
      EntityType.PROFILE,
      {
        max: entitiesConfigMax.get(EntityType.PROFILE) ?? 300,
        ttl: toSeconds(entitiesConfigTtl.get(EntityType.PROFILE) ?? ms('15s'))
      }
    ],
    [
      EntityType.SCENE,
      {
        max: entitiesConfigMax.get(EntityType.SCENE) ?? 100000,
        ttl: toSeconds(entitiesConfigTtl.get(EntityType.SCENE) ?? ms('20s'))
      }
    ],
    [
      EntityType.WEARABLE,
      {
        max: entitiesConfigMax.get(EntityType.WEARABLE) ?? 100000,
        ttl: toSeconds(entitiesConfigTtl.get(EntityType.WEARABLE) ?? ms('20s'))
      }
    ],
    [
      EntityType.STORE,
      {
        max: entitiesConfigMax.get(EntityType.STORE) ?? 300,
        ttl: toSeconds(entitiesConfigTtl.get(EntityType.STORE) ?? ms('1m'))
      }
    ],
    [
      EntityType.EMOTE,
      {
        max: entitiesConfigMax.get(EntityType.EMOTE) ?? 100000,
        ttl: toSeconds(entitiesConfigTtl.get(EntityType.EMOTE) ?? ms('20s'))
      }
    ],
    [
      EntityType.OUTFITS,
      {
        max: entitiesConfigMax.get(EntityType.OUTFITS) ?? 100000,
        ttl: toSeconds(entitiesConfigTtl.get(EntityType.OUTFITS) ?? ms('20s'))
      }
    ]
  ])
}
