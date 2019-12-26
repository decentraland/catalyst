import CachingMap from "caching-map"

export class Cache<Key, Value> {

    private internalCache: CachingMap

    private constructor(calculation: (key: Key) => Promise<Value>, size: number, ttl: number | undefined) {
        this.internalCache = new CachingMap(size)

        if (ttl) {
            this.internalCache.materialize = (key: Key) => {
                let valuePromise = calculation(key)
                valuePromise.then(_ => this.internalCache.set(key, valuePromise, { ttl }))
                return valuePromise
            }
        } else {
            this.internalCache.materialize = (key: Key) => calculation(key)
        }
    }

    get(key: Key): Promise<Value> {
        return this.internalCache.get(key)
    }

    delete(key: Key) {
        this.internalCache.delete(key)
    }

    static withCalculation<K, V>(calculation: (key: K) => Promise<V>, size: number, ttl?: number): Cache<K, V> {
        return new Cache(calculation, size, ttl)
    }

}