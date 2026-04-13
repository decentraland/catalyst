import { ILoggerComponent } from '@well-known-components/interfaces'
import { EntityType } from '@dcl/schemas'
import { ICacheStorageComponent } from '@dcl/core-commons'
import { createInMemoryCacheComponent } from '@dcl/memory-cache-component'
import ms from 'ms'
import { AppComponents } from '../types'

export type IDeployRateLimiterComponent = {
  newDeployment(entityType: EntityType, pointers: string[], localTimestamp: number): Promise<void>
  isRateLimited(entityType: EntityType, pointers: string[]): Promise<boolean>
  newUnchangedDeployment(entityType: EntityType, pointers: string[], localTimestamp: number): Promise<void>
  isUnchangedDeploymentRateLimited(entityType: EntityType, pointers: string[]): Promise<boolean>
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

  // One shared cache instance per entity type for deployment rate limiting
  const deploymentCaches: Map<EntityType, { cache: ICacheStorageComponent; maxSize: number; ttlSeconds: number }> =
    new Map()
  // One shared cache instance per entity type for unchanged deployment rate limiting
  const unchangedCaches: Map<EntityType, { cache: ICacheStorageComponent; ttlSeconds: number }> = new Map()

  const configPerEntityType = getCacheConfigPerEntityMap(rateLimitConfig.entitiesConfigMax, rateLimitConfig.entitiesConfigTtl)

  for (const entityType of Object.values(EntityType)) {
    const ttlSeconds: number = configPerEntityType.get(entityType)?.ttl ?? toSeconds(rateLimitConfig.defaultTtl)
    const maxSize: number = configPerEntityType.get(entityType)?.max ?? rateLimitConfig.defaultMax

    deploymentCaches.set(entityType, {
      cache: createInMemoryCacheComponent(),
      maxSize,
      ttlSeconds
    })

    const unchangedTtlSeconds = toSeconds(rateLimitConfig.entitiesConfigUnchangedTtl.get(entityType) ?? 0)
    unchangedCaches.set(entityType, {
      cache: createInMemoryCacheComponent(),
      ttlSeconds: unchangedTtlSeconds
    })
  }

  // Log configuration
  const configEntries: string[] = []
  for (const [entityType, { maxSize, ttlSeconds }] of deploymentCaches) {
    configEntries.push(`${entityType}: { ttl: ${ttlSeconds}, max: ${maxSize} }`)
  }
  logs.info(`Deployment Cache Map created to rate limit amount of deployments per entity with values: \n${configEntries.join('\n')}`)

  const unchangedConfigEntries: string[] = []
  for (const [entityType, { ttlSeconds }] of unchangedCaches) {
    if (ttlSeconds > 0) {
      unchangedConfigEntries.push(`${entityType}: { unchanged_ttl: ${ttlSeconds} }`)
    }
  }
  if (unchangedConfigEntries.length > 0) {
    logs.info(`Unchanged deployment rate limit configured for:\n${unchangedConfigEntries.join('\n')}`)
  }

  // Set static max size gauge for each entity type
  for (const [entityType, { maxSize }] of deploymentCaches) {
    components.metrics.observe('dcl_content_rate_limiter_cache_max_size', { entity_type: entityType }, maxSize)
  }

  function getDeploymentCache(entityType: EntityType) {
    const entry = deploymentCaches.get(entityType)
    if (!entry) {
      throw new Error(`Invalid Entity Type: ${entityType}`)
    }
    return entry
  }

  function getUnchangedCache(entityType: EntityType) {
    const entry = unchangedCaches.get(entityType)
    if (!entry) {
      throw new Error(`Invalid Entity Type: ${entityType}`)
    }
    return entry
  }

  return {
    async newDeployment(entityType: EntityType, pointers: string[], localTimestamp: number): Promise<void> {
      const { cache, ttlSeconds } = getDeploymentCache(entityType)
      for (const pointer of pointers) {
        await cache.set(pointer, localTimestamp, ttlSeconds)
      }
      const keys = await cache.keys()
      components.metrics.observe(
        'dcl_content_rate_limiter_cache_keys',
        { entity_type: entityType, cache_type: 'deployment' },
        keys.length
      )
    },

    async isRateLimited(entityType: EntityType, pointers: string[]): Promise<boolean> {
      const { cache, maxSize } = getDeploymentCache(entityType)
      let ttlHit = false
      for (const p of pointers) {
        if ((await cache.get(p)) !== null) {
          ttlHit = true
          break
        }
      }
      const keys = await cache.keys()
      const maxSizeHit = keys.length > maxSize

      if (ttlHit || maxSizeHit) {
        components.metrics.increment('dcl_content_rate_limited_deployments_total', {
          entity_type: entityType,
          reason: ttlHit ? 'ttl' : 'max_size'
        })
      }

      return ttlHit || maxSizeHit
    },

    async newUnchangedDeployment(entityType: EntityType, pointers: string[], localTimestamp: number): Promise<void> {
      const { cache, ttlSeconds } = getUnchangedCache(entityType)
      for (const pointer of pointers) {
        await cache.set(pointer, localTimestamp, ttlSeconds)
      }
      const keys = await cache.keys()
      components.metrics.observe(
        'dcl_content_rate_limiter_cache_keys',
        { entity_type: entityType, cache_type: 'unchanged' },
        keys.length
      )
    },

    async isUnchangedDeploymentRateLimited(entityType: EntityType, pointers: string[]): Promise<boolean> {
      const { cache } = getUnchangedCache(entityType)
      for (const p of pointers) {
        if ((await cache.get(p)) !== null) {
          components.metrics.increment('dcl_content_rate_limited_deployments_total', {
            entity_type: entityType,
            reason: 'unchanged_ttl'
          })
          return true
        }
      }
      return false
    }
  }
}

/**
 * Convert milliseconds to seconds for cache TTL which expects seconds.
 */
function toSeconds(milliseconds: number): number {
  return Math.floor(milliseconds / 1000)
}

function getCacheConfigPerEntityMap(
  entitiesConfigMax: Map<EntityType, number>,
  entitiesConfigTtl: Map<EntityType, number>
): Map<EntityType, { max: number; ttl: number }> {
  return new Map([
    [EntityType.PROFILE, {
      max: entitiesConfigMax.get(EntityType.PROFILE) ?? 500,
      ttl: toSeconds(entitiesConfigTtl.get(EntityType.PROFILE) ?? ms('3s'))
    }],
    [EntityType.SCENE, {
      max: entitiesConfigMax.get(EntityType.SCENE) ?? 1000,
      ttl: toSeconds(entitiesConfigTtl.get(EntityType.SCENE) ?? ms('20s'))
    }],
    [EntityType.WEARABLE, {
      max: entitiesConfigMax.get(EntityType.WEARABLE) ?? 1000,
      ttl: toSeconds(entitiesConfigTtl.get(EntityType.WEARABLE) ?? ms('20s'))
    }],
    [EntityType.STORE, {
      max: entitiesConfigMax.get(EntityType.STORE) ?? 300,
      ttl: toSeconds(entitiesConfigTtl.get(EntityType.STORE) ?? ms('3s'))
    }],
    [EntityType.EMOTE, {
      max: entitiesConfigMax.get(EntityType.EMOTE) ?? 1000,
      ttl: toSeconds(entitiesConfigTtl.get(EntityType.EMOTE) ?? ms('20s'))
    }],
    [EntityType.OUTFITS, {
      max: entitiesConfigMax.get(EntityType.OUTFITS) ?? 2000,
      ttl: toSeconds(entitiesConfigTtl.get(EntityType.OUTFITS) ?? ms('3s'))
    }]
  ])
}
