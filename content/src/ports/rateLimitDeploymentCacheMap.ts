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
  const envMaxPerEntity: Map<EntityType, number> = getMaxPerEntityMapConfig(rateLimitConfig.entitiesConfigMax)
  const envTtlPerEntity: Map<EntityType, number> = getTtlPerEntityMapConfig(rateLimitConfig.entitiesConfigTtl)

  const deploymentCacheMap: Map<EntityType, { cache: NodeCache; maxSize: number }> = new Map()

  for (const entityType of Object.values(EntityType)) {
    const ttl: number = envTtlPerEntity.get(entityType) ?? rateLimitConfig.defaultTtl
    const maxSize: number = envMaxPerEntity.get(entityType) ?? rateLimitConfig.defaultMax

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

function getTtlPerEntityMapConfig(config: Map<EntityType, number>) {
  const defaultTtlPerEntity: Map<EntityType, number> = new Map([
    [EntityType.PROFILE, ms('1m')],
    [EntityType.SCENE, ms('20s')],
    [EntityType.WEARABLE, ms('20s')],
    [EntityType.STORE, ms('1m')]
  ])
  return new Map([...defaultTtlPerEntity, ...config])
}

function getMaxPerEntityMapConfig(config: Map<EntityType, number>) {
  const defaultMaxPerEntity: Map<EntityType, number> = new Map([
    [EntityType.PROFILE, 300],
    [EntityType.SCENE, 100000],
    [EntityType.WEARABLE, 100000],
    [EntityType.STORE, 300]
  ])
  return new Map([...defaultMaxPerEntity, ...config])
}
