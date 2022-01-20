import { Entity, Pointer } from 'dcl-catalyst-commons'
import NodeCache from 'node-cache'
import { EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'
import { Cache } from './caching/Cache'
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
    >
  ): ServiceImpl {
    const { env } = components
    // TODO: Config this in env var
    const cache = new Cache<Pointer, Entity>(10000)
    const ttl = env.getConfig(EnvironmentConfig.DEPLOYMENTS_RATE_LIMIT_TTL) as number
    const deploymentsCache = new NodeCache({ stdTTL: ttl, checkperiod: ttl })
    return new ServiceImpl(components, cache, {
      cache: deploymentsCache,
      maxSize: env.getConfig(EnvironmentConfig.DEPLOYMENTS_RATE_LIMIT_MAX)
    })
  }
}
