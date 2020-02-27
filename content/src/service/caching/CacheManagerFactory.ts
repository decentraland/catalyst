import { CacheManager } from "./CacheManager"
import { Environment, EnvironmentConfig } from "@katalyst/content/Environment"

export class CacheManagerFactory {

    static create(env: Environment): CacheManager {
        return new CacheManager(env.getConfig(EnvironmentConfig.CACHE_SIZES))
    }

}