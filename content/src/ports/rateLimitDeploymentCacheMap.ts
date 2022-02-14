import { ILoggerComponent } from '@well-known-components/interfaces'
import { EntityType, Pointer, Timestamp } from 'dcl-catalyst-commons'
import ms from 'ms'
import NodeCache from 'node-cache'
import { AppComponents } from '../types'

export type IRateLimitDeploymentCacheMapComponent = {
  newDeployment(entityType: EntityType, pointers: Pointer[], localTimestamp: Timestamp): void
  isRateLimited(entityType: EntityType, pointers: Pointer[]): boolean
}

export type RateLimitConfig = {
  defaultTtl: number
  defaultMax: number
  entitiesConfigTtl: Map<EntityType, number>
  entitiesConfigMax: Map<EntityType, number>
}

export function createRateLimitDeploymentCacheMap(
  components: Pick<AppComponents, 'logs'>,
  rateLimitConfig: RateLimitConfig
): IRateLimitDeploymentCacheMapComponent {
  const logs: ILoggerComponent.ILogger = components.logs.getLogger('RateLimitDeploymentCacheMapComponent')

  const deploymentCacheMap: Map<EntityType, { cache: NodeCache; maxSize: number }> = generateDeploymentCacheMap(
    logs,
    rateLimitConfig
  )

  function getFromCache(entityType: EntityType): { cache: NodeCache; maxSize: number } {
    const cache = deploymentCacheMap.get(entityType)
    if (!cache) {
      throw new Error(`Invalid Entity Type: ${entityType}`)
    }
    return cache
  }

  return {
    newDeployment(entityType: EntityType, pointers: Pointer[], localTimestamp: Timestamp): void {
      const cacheByEntityType = getFromCache(entityType)
      for (const pointer in pointers) {
        cacheByEntityType.cache.set(pointer, localTimestamp)
      }
    },

    /** Check if the entity should be rate limit: no deployment has been made for the same pointer in the last ttl
     * and no more than max size of deployments were made either   */
    isRateLimited(entityType: EntityType, pointers: Pointer[]): boolean {
      const cacheByEntityType = getFromCache(entityType)
      return (
        pointers.some((p) => !!cacheByEntityType.cache.get(p)) ||
        cacheByEntityType.cache.stats.keys > cacheByEntityType.maxSize
      )
    }
  }
}

function generateDeploymentCacheMap(
  logs: ILoggerComponent.ILogger,
  rateLimitConfig: RateLimitConfig
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

function getCacheConfigPerEntityMap(
  entitiesConfigMax: Map<EntityType, number>,
  entitiesConfigTtl: Map<EntityType, number>
): Map<EntityType, { max: number; ttl: number }> {
  return new Map([
    [
      EntityType.PROFILE,
      {
        max: entitiesConfigMax.get(EntityType.PROFILE) ?? 300,
        ttl: entitiesConfigTtl.get(EntityType.PROFILE) ?? ms('1m')
      }
    ],
    [
      EntityType.SCENE,
      {
        max: entitiesConfigMax.get(EntityType.SCENE) ?? 100000,
        ttl: entitiesConfigTtl.get(EntityType.SCENE) ?? ms('20s')
      }
    ],
    [
      EntityType.WEARABLE,
      {
        max: entitiesConfigMax.get(EntityType.WEARABLE) ?? 100000,
        ttl: entitiesConfigTtl.get(EntityType.WEARABLE) ?? ms('20s')
      }
    ],
    [
      EntityType.STORE,
      {
        max: entitiesConfigMax.get(EntityType.STORE) ?? 300,
        ttl: entitiesConfigTtl.get(EntityType.STORE) ?? ms('1m')
      }
    ]
  ])
}
