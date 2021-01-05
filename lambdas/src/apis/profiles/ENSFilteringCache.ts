import { EthAddress } from 'dcl-crypto'
import LRU from 'lru-cache'
import ms from 'ms'

/** This is a custom cache for storing requests of the owned names, that can be configured with a max size of elements */
export class ENSFilteringCache {
  // The cache lib returns undefined when no value was calculated at all. The value of the cache is the context of the request done.
  private internalCache: LRU<EthAddress, { listedNames: string[]; ownedNames: string[] }>

  constructor(size: number = 500, maxAge: number = ms('3d')) {
    this.internalCache = new LRU({ max: size, maxAge: maxAge })
  }

  /**
   * Get the values for the given key, or calculates it if it's not present.
   */
  async get(
    key: string,
    listedNames: string[],
    orCalculate: (key: string, listedNames: string[]) => Promise<string[] | undefined>
  ): Promise<string[] | undefined> {
    // Check what is on the cache
    const onCache: { listedNames: string[]; ownedNames: string[] } | undefined = this.internalCache.get(key)

    if (!!onCache && listedNames == onCache.listedNames) {
      return onCache.ownedNames
    } else {
      const calculated = await orCalculate(key, listedNames)
      // Save the calculated value only if not empty
      if (!!calculated) {
        this.internalCache.set(key, { listedNames: listedNames, ownedNames: calculated })
        return calculated
      }
    }
  }
}
