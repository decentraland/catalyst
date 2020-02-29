import CachingMap from "caching-map"
import { EntityType } from "../Entity"

/** This is a regular cache, that can be configured with a max size of elements */
export class Cache<Key, Value> {

    private internalCache: CachingMap

    private constructor(calculation: (key: Key) => Promise<Value>, size: number) {
        this.internalCache = new CachingMap(size)
        this.internalCache.materialize = (key: Key) => calculation(key)
    }

    get(key: Key): Promise<Value> {
        return this.internalCache.get(key)
    }

    invalidate(key: Key) {
        this.internalCache.delete(key)
    }

    static withCalculation<K, V>(calculation: (key: K) => Promise<V>, size: number): Cache<K, V> {
        return new Cache(calculation, size)
    }

}

/** This is a cache that can be configured per entity type */
export class CacheByType<Key, Value> {

    private constructor(private readonly cachesByType: Map<EntityType, Cache<Key, Value>>) { }

    get(type: EntityType, key: Key): Promise<Value> {
        return this.cachesByType.get(type)!!.get(key)
    }

    invalidate(type: EntityType, key: Key) {
        this.cachesByType.get(type)!!.invalidate(key)
    }

    static withCalculation<K, V>(calculation: (key: [EntityType, K]) => Promise<V>, sizes: Map<EntityType, number>): CacheByType<K, V> {
        const cachesByType: Map<EntityType, Cache<K, V>> = new Map()

        Object.values(EntityType).forEach((entityType: EntityType) => {
            const cacheSize = sizes.get(entityType)
            if (!cacheSize) {
                throw new Error(`Can't build a cache by type since it is missing the type '${entityType}'.`)
            }
            const cache: Cache<K, V> = Cache.withCalculation(key => calculation([entityType, key]), cacheSize)
            cachesByType.set(entityType, cache)
        })

        return new CacheByType(cachesByType)
    }
}