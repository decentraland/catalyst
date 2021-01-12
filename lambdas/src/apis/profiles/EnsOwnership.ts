import { Fetcher } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import log4js from 'log4js'
import LRU from 'lru-cache'

export class EnsOwnership {
  private static LOGGER = log4js.getLogger('ENSOwnership')
  private static readonly QUERY: string = `
    query FilterNamesByOwner($owner: String, $names: [String]) {
        nfts(
            where: {
                owner: $owner,
                name_in: $names,
                category: ens }) {
            name
        }
    }`
  private cache: EnsOwnershipCache

  constructor(
    private readonly theGraphBaseUrl: string,
    private readonly fetcher: Fetcher,
    maxSize: number,
    maxAge: number
  ) {
    this.cache = new EnsOwnershipCache(maxSize, maxAge, (ethAddress, names) => this.getTheGraph(ethAddress, names))
  }

  areNamesOwned(ethAddress: EthAddress, namesToCheck: Name[]): Promise<Map<Name, Owned>> {
    return this.cache.areNamesOwned(ethAddress.toLowerCase(), namesToCheck)
  }

  private async getTheGraph(ethAddress: EthAddress, names: Name[]) {
    try {
      const response = this.fetcher.queryGraph<{ nfts: { name: string }[] }>(this.theGraphBaseUrl, EnsOwnership.QUERY, {
        owner: ethAddress,
        names
      })
      return (await response).nfts.map((nft) => nft.name)
    } catch (error) {
      EnsOwnership.LOGGER.error(`Could not retrieve ENSs for address ${ethAddress}.`, error)
      return []
    }
  }
}

/**
 * This is a custom cache for storing whether an eth address owns a name or not. It can be configured with a max size of elements
 */
class EnsOwnershipCache {
  // The cache lib returns undefined when no value was calculated at all. The value of the LRU, is whether the name was owned or not
  private internalCache: LRU<EthAddressNamePair, boolean>

  constructor(
    maxSize: number,
    maxAge: number,
    private readonly filterOutCall: (ethAddress: EthAddress, names: Name[]) => Promise<Name[]>
  ) {
    this.internalCache = new LRU({ max: maxSize, maxAge })
  }

  async areNamesOwned(ethAddress: EthAddress, namesToCheck: Name[]): Promise<Map<Name, Owned>> {
    // Set up result
    const result: Map<Name, boolean> = new Map()

    // Check what is on the cache
    const unknown: Name[] = []
    for (const name of namesToCheck) {
      const key = this.concat(ethAddress, name)
      const isOwned: Owned | undefined = this.internalCache.get(key)
      if (isOwned === undefined) {
        unknown.push(name)
      } else {
        result.set(name, isOwned)
      }
    }

    // Check if unknown names are owned or not
    const graphFetchResult = await this.fetchIfNamesAreOwned(ethAddress, unknown)

    // Store result in the cache
    for (const [name, owned] of graphFetchResult) {
      const key = this.concat(ethAddress, name)
      this.internalCache.set(key, owned)
      result.set(name, owned)
    }

    return result
  }

  private concat(ethAddress: EthAddress, name: Name): EthAddressNamePair {
    return `${ethAddress}-${name}`
  }

  private async fetchIfNamesAreOwned(ethAddress: EthAddress, names: string[]): Promise<Map<string, boolean>> {
    const owned: Set<string> = new Set(await this.filterOutCall(ethAddress, names))
    return new Map(names.map((name) => [name, owned.has(name)]))
  }
}

type Owned = boolean
type Name = string
type EthAddressNamePair = string
