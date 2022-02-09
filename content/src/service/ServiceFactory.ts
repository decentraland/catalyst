import { Entity, Pointer } from 'dcl-catalyst-commons'
import { AppComponents } from '../types'
import { ENTITIES_BY_POINTERS_CACHE_CONFIG } from './caching/CacheManager'
import { CacheManagerFactory } from './caching/CacheManagerFactory'
import { ServiceImpl } from './ServiceImpl'

export class ServiceFactory {
  static create(
    components: Pick<
      AppComponents,
      | 'pointerManager'
      | 'failedDeploymentsCache'
      | 'rateLimitDeploymentCacheMap'
      | 'deploymentManager'
      | 'storage'
      | 'repository'
      | 'validator'
      | 'serverValidator'
      | 'metrics'
      | 'env'
      | 'logs'
      | 'authenticator'
      | 'database'
      | 'deployedEntitiesFilter'
    >
  ): ServiceImpl {
    const { env } = components
    // TODO: move this inside ServiceImpl constructor
    const cacheManager = CacheManagerFactory.create(env)
    const cache = cacheManager.buildEntityTypedCache<Pointer, Entity>(ENTITIES_BY_POINTERS_CACHE_CONFIG)
    return new ServiceImpl(components, cache)
  }
}
