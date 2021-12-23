import { Environment, EnvironmentConfig } from '../../Environment'
import { CacheManager } from './CacheManager'

export class CacheManagerFactory {
  static create(env: Environment): CacheManager {
    const cacheSizes: Map<string, number> = new Map()
    const envCacheSizes: Map<string, string | undefined> = env.getConfig(EnvironmentConfig.CACHE_SIZES)

    if (envCacheSizes) {
      envCacheSizes.forEach((value: string | undefined, key: string) => {
        console.log(`Key: ${key}, Value:${value}`)
        if (!!value) {
          cacheSizes.set(key, +value)
        }
      })
    }

    return new CacheManager(cacheSizes)
  }
}
