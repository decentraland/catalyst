import { Environment, EnvironmentConfig } from '../../Environment'
import { CacheManager } from './CacheManager'

export class CacheManagerFactory {
  static create(env: Environment): CacheManager {
    return new CacheManager(env.getConfig(EnvironmentConfig.CACHE_SIZES))
  }
}
