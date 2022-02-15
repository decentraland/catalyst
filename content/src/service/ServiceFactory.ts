import { Entity, Pointer } from 'dcl-catalyst-commons'
import NodeCache from 'node-cache'
import { EnvironmentConfig } from '../Environment'
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
      | 'denylist'
    >
  ): ServiceImpl {
    const { env } = components
    // TODO: move this inside ServiceImpl constructor
    const cacheManager = CacheManagerFactory.create(env)
    const cache = cacheManager.buildEntityTypedCache<Pointer, Entity>(ENTITIES_BY_POINTERS_CACHE_CONFIG)
    const ttl = env.getConfig(EnvironmentConfig.DEPLOYMENTS_RATE_LIMIT_TTL) as number
    const deploymentsCache = new NodeCache({ stdTTL: ttl, checkperiod: ttl })
    return new ServiceImpl(components, cache, {
      cache: deploymentsCache,
      maxSize: env.getConfig(EnvironmentConfig.DEPLOYMENTS_RATE_LIMIT_MAX)
    })
  }
}
