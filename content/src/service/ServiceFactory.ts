import { Pointer } from 'dcl-catalyst-commons'
import { Bean, Environment, EnvironmentConfig } from '../Environment'
import { CacheManager, ENTITIES_BY_POINTERS_CACHE_CONFIG } from './caching/CacheManager'
import { Entity } from './Entity'
import { ClusterDeploymentsService, MetaverseContentService } from './Service'
import { ServiceImpl } from './ServiceImpl'
import { ServiceStorage } from './ServiceStorage'

export class ServiceFactory {
  static create(env: Environment): MetaverseContentService & ClusterDeploymentsService {
    const serviceStorage = new ServiceStorage(env.getBean(Bean.STORAGE))
    const cacheManager: CacheManager = env.getBean(Bean.CACHE_MANAGER)
    const cache = cacheManager.buildEntityTypedCache<Pointer, Entity>(ENTITIES_BY_POINTERS_CACHE_CONFIG)
    return new ServiceImpl(
      serviceStorage,
      env.getBean(Bean.POINTER_MANAGER),
      env.getBean(Bean.FAILED_DEPLOYMENTS_MANAGER),
      env.getBean(Bean.DEPLOYMENT_MANAGER),
      env.getBean(Bean.VALIDATOR),
      env.getBean(Bean.REPOSITORY),
      cache,
      {
        cache: env.getBean(Bean.DEPLOYMENTS_RATE_LIMIT_CACHE),
        maxSize: env.getConfig(EnvironmentConfig.DEPLOYMENTS_RATE_LIMIT_MAX)
      }
    )
  }
}
