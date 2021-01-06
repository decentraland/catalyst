import { Fetcher } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import LRU from 'lru-cache'

export class ENSFilter {
  private cache: ENSFilteringCache
  query: string = `
  query FilterNamesByOwner($owner: String, $names: [String]) {
      nfts(
          where: {
              owner: $owner,
              name_in: $names,
              category: ens }) {
          name
      }
  }`

  constructor(size: number, maxAge: number) {
    this.cache = new ENSFilteringCache(size, maxAge)
  }

  async filter(
    fetcher: Fetcher,
    theGraphBaseUrl: string,
    ethAddress: EthAddress,
    namesToFilter: string[]
  ): Promise<string[]> {
    return await this.cache.get(ethAddress.toLowerCase(), namesToFilter, async (owner, names) => {
      return await this.getTheGraph(owner, names, fetcher, theGraphBaseUrl, ethAddress)
    })
  }

  private async getTheGraph(
    owner: string,
    names: string[],
    fetcher: Fetcher,
    theGraphBaseUrl: string,
    ethAddress: string
  ) {
    try {
      const response = fetcher.queryGraph<{ nfts: { name: string }[] }>(theGraphBaseUrl, this.query, {
        owner: owner,
        names: names
      })
      return (await response).nfts.map((nft) => nft.name)
    } catch (error) {
      console.log(`Could not retrieve ENSs for address ${ethAddress}.`, error)
    }
  }
}

/** This is a custom cache for storing requests of the owned names, that can be configured with a max size of elements */
class ENSFilteringCache {
  // The cache lib returns undefined when no value was calculated at all. The value of the cache is the context of the request done.
  private internalCache: LRU<EthAddress, { listedNames: string[]; ownedNames: string[] }>

  constructor(size: number, maxAge: number) {
    this.internalCache = new LRU({ max: size, maxAge: maxAge })
  }

  /**
   * Get the values for the given key, or calculates it if it's not present.
   */
  async get(
    key: string,
    listedNames: string[],
    orCalculate: (key: string, listedNames: string[]) => Promise<string[] | undefined>
  ): Promise<string[]> {
    // Check what is on the cache
    const onCache: { listedNames: string[]; ownedNames: string[] } | undefined = this.internalCache.get(key)

    // We only want to retrieve the cached value when the listed names requested is the same
    if (!!onCache && this.arraysEqual(listedNames, onCache.listedNames)) {
      return onCache.ownedNames
    }
    const calculated = await orCalculate(key, listedNames)
    // Save the calculated value only if not empty
    if (!!calculated) {
      this.internalCache.set(key, { listedNames: listedNames, ownedNames: calculated })
      return calculated
    }
    return []
  }

  private arraysEqual(a1: string[], a2: string[]) {
    /* WARNING: arrays must not contain {objects} or behavior may be undefined */
    return JSON.stringify(a1) == JSON.stringify(a2)
  }
}
