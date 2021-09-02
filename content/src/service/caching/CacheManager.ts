import { EntityType } from 'dcl-catalyst-commons'
import { CacheByType } from './Cache'

/** This manger is used to create cache instances, based on some pre-configured defaults */
export class CacheManager {
  private readonly cacheSizes: Map<string, number>

  constructor(cacheSizes: Map<string, number> = new Map()) {
    this.cacheSizes = new Map(Array.from(cacheSizes.entries()).map(([name, size]) => [name.toUpperCase(), size]))
  }

  buildEntityTypedCache<K, V>(cacheConfig: CacheConfig): CacheByType<K, V> {
    const cacheSizes: Map<EntityType, number> = new Map()

    Object.values(EntityType).forEach((entityType: EntityType) => {
      const cacheName = this.getTypedCacheConfigName(cacheConfig, entityType)
      const cacheSize = this.cacheSizes.get(cacheName) ?? cacheConfig.getDefaultSize(entityType)
      cacheSizes.set(entityType, cacheSize)
    })

    return CacheByType.withSizes(cacheSizes)
  }

  private getTypedCacheConfigName(cacheConfig: CacheConfig, type: EntityType) {
    return `CACHE_${cacheConfig.getName()}_${type}`.toUpperCase()
  }
}

export class CacheConfig {
  private readonly name: string
  private readonly defaultSizes: Map<EntityType, number> = new Map()

  constructor(builder: CacheConfigBuilder) {
    this.name = builder.name
    this.defaultSizes = builder.defaultSizes
  }

  getDefaultSize(entityType: EntityType): number {
    return this.defaultSizes.get(entityType)!
  }

  getName(): string {
    return this.name
  }
}

class CacheConfigBuilder {
  readonly defaultSizes: Map<EntityType, number> = new Map()

  constructor(readonly name: string) {}

  withDefaultSize(entityType: EntityType, size: number): CacheConfigBuilder {
    this.defaultSizes.set(entityType, size)
    return this
  }

  build(): CacheConfig {
    Object.values(EntityType).forEach((entityType: EntityType) => {
      if (!this.defaultSizes.has(entityType)) {
        throw new Error(`Can't build a cache config since it is missing the type '${entityType}'.`)
      }
    })
    return new CacheConfig(this)
  }
}

export const ENTITIES_BY_POINTERS_CACHE_CONFIG = new CacheConfigBuilder('ENTITIES_BY_POINTERS')
  .withDefaultSize(EntityType.PROFILE, 2000)
  .withDefaultSize(EntityType.SCENE, 10000)
  .withDefaultSize(EntityType.WEARABLE, 2000)
  .build()
