import { Environment, EnvironmentConfig } from '../../Environment'
import { CacheManager } from './CacheManager'

export class CacheManagerFactory {
  static create(env: Environment): CacheManager {
    const cacheSizes: Map<string, number> = new Map()
    ;(env.getConfig(EnvironmentConfig.CACHE_SIZES) as Map<string, string | undefined>).forEach(
      (value: string | undefined, key: string) => {
        console.log(`Key: ${key}, Value:${value}`)
        if (!!value) {
          cacheSizes.set(key, +value)
        }
      }
    )
    return new CacheManager(cacheSizes)
  }
}
