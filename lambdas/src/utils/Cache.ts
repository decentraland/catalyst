import LRU from 'lru-cache'
import ms from 'ms'

/** This is a regular cache, that can be configured with a max size of elements */
export class Cache<Key, Value> {
  // The cache lib returns undefined when no value was calculated at all.
  private internalCache: LRU<Key, Value>

  constructor(size: number = 500, maxAge: number = ms('3d')) {
    this.internalCache = new LRU({ max: size, maxAge: maxAge })
  }

  /**
   * Get the values for the given key, or calculates it if it's not present.
   */
  async get(key: Key, orCalculate: (key: Key) => Promise<Value>): Promise<Value> {
    // Check what is on the cache
    const onCache: Value | undefined = this.internalCache.get(key)

    if (onCache === undefined) {
      const calculated = await orCalculate(key)
      // Save the calculated value.
      this.internalCache.set(key, calculated)
      return calculated
    } else {
      return onCache
    }
  }

  invalidate(key: Key): void {
    this.internalCache.del(key)
  }
}
