import CachingMap from "caching-map"

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