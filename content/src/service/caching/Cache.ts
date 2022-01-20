import LRU from 'lru-cache'

/** This is a regular cache, that can be configured with a max size of elements */
export class Cache<Key, Value> {
  // Null implies that there is no value set for the key even though one was calculated for it.
  // The cache lib returns undefined when no value was calculated at all.
  private internalCache: LRU<Key, Value | null>

  constructor(size: number) {
    this.internalCache = new LRU({ max: size })
  }

  /**
   * Get the values for the given keys, or calculate them if they are nor present.
   * If no value can be calculated for a given key, then the key shouldn't be present, or it should be, with an `undefined` value.
   */
  async get(keys: Key[], orCalculate: (keys: Key[]) => Promise<Map<Key, Value | undefined>>): Promise<Value[]> {
    // Check what is on the cache
    const onCache: Map<Key, Value | null | undefined> = new Map(keys.map((key) => [key, this.internalCache.get(key)]))

    // Get all the keys without values calculated
    const missing: Key[] = Array.from(onCache.entries())
      .filter(([, value]) => value === undefined)
      .map(([key]) => key)

    // Calculate values for those keys
    const calculated: Map<Key, Value | undefined> = missing.length > 0 ? await orCalculate(missing) : new Map()

    // Save the calculated values. When a key doesn't have a value, set it as null
    for (const [key, value] of calculated) {
      this.internalCache.set(key, value ?? null)
    }

    // Concatenate the results and return them
    return [
      ...Array.from(onCache.values()).filter((value): value is Value => !!value),
      ...Array.from(calculated.values()).filter((value): value is Value => !!value)
    ]
  }

  invalidate(key: Key) {
    this.internalCache.del(key)
  }
}
