import { EntityType, Pointer, Timestamp } from 'dcl-catalyst-commons'
import ms from 'ms'
import NodeCache from 'node-cache'
import { Environment, EnvironmentConfig } from '../Environment'

export type IRateLimitDeploymentCacheMapComponent = {
  newDeployment(entityType: EntityType, pointers: Pointer[], localTimestamp: Timestamp): void
  isRateLimited(entityType: EntityType, pointers: Pointer[]): boolean
}

export function createRateLimitDeploymentCacheMap(env: Environment): IRateLimitDeploymentCacheMapComponent {
  const deploymentCacheMap: Map<EntityType, { cache: NodeCache; maxSize: number }> = generateDeploymentCacheMap(env)

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

function generateDeploymentCacheMap(env: Environment): Map<EntityType, { cache: NodeCache; maxSize: number }> {
  const envMaxPerEntity: Map<EntityType, number> = getMaxPerEntityMapConfig(env)
  const envTtlPerEntity: Map<EntityType, number> = getTtlPerEntityMapConfig(env)

  const deploymentCacheMap: Map<EntityType, { cache: NodeCache; maxSize: number }> = new Map()

  for (const entityType of Object.values(EntityType)) {
    const ttl: number =
      envTtlPerEntity.get(entityType) ?? env.getConfig(EnvironmentConfig.DEPLOYMENTS_DEFAULT_RATE_LIMIT_TTL)
    const maxSize: number =
      envMaxPerEntity.get(entityType) ?? env.getConfig(EnvironmentConfig.DEPLOYMENTS_DEFAULT_RATE_LIMIT_MAX)

    deploymentCacheMap.set(entityType, {
      cache: new NodeCache({ stdTTL: ttl, checkperiod: ttl }),
      maxSize: maxSize
    })
  }
  return deploymentCacheMap
}

function getTtlPerEntityMapConfig(env: Environment) {
  const defaultTtlPerEntity: Map<EntityType, number> = new Map([
    [EntityType.PROFILE, ms('1m')],
    [EntityType.SCENE, ms('20s')],
    [EntityType.WEARABLE, ms('20s')],
    [EntityType.STORE, ms('1m')]
  ])
  const envTtlPerEntityOverrideConfig: Map<EntityType, number> =
    env.getConfig<Map<EntityType, number>>(EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_TTL) ?? new Map()
  const envTtlPerEntity: Map<EntityType, number> = new Map([...defaultTtlPerEntity, ...envTtlPerEntityOverrideConfig])
  return envTtlPerEntity
}

function getMaxPerEntityMapConfig(env: Environment) {
  const defaultMaxPerEntity: Map<EntityType, number> = new Map([
    [EntityType.PROFILE, 300],
    [EntityType.SCENE, 100000],
    [EntityType.WEARABLE, 100000],
    [EntityType.STORE, 300]
  ])
  const envMaxPerEntityOverrideConfig: Map<EntityType, number> =
    env.getConfig<Map<EntityType, number>>(EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_MAX) ?? new Map()
  const envMaxPerEntity: Map<EntityType, number> = new Map([...defaultMaxPerEntity, ...envMaxPerEntityOverrideConfig])
  return envMaxPerEntity
}
