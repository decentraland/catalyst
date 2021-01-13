import { Fetcher } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import log4js from 'log4js'
import LRU from 'lru-cache'

/**
 * This is a custom cache for storing the owner of a given name. It can be configured with a max size of elements
 */
export class EnsOwnership {
  private static readonly PAGE_SIZE = 1000 // The graph has a 1000 limit when return the response
  private static LOGGER = log4js.getLogger('EnsOwnership')
  private static readonly QUERY: string = `
    query FetchNamesByOwner($names: [String]) {
        nfts(
            where: {
                name_in: $names,
                category: ens
            })
        {
            name
            owner {
              address
            }
        }
    }`

  // The cache lib returns undefined when no value was calculated at all. We will set a 'null' value when we checked the blockchain, and there was no owner
  private internalCache: LRU<Name, EthAddress | null>

  constructor(
    private readonly theGraphBaseUrl: string,
    private readonly fetcher: Fetcher,
    maxSize: number,
    maxAge: number
  ) {
    this.internalCache = new LRU({ max: maxSize, maxAge })
  }

  async areNamesOwnedByAddress(ethAddress: EthAddress, namesToCheck: Name[]): Promise<Map<Name, Owned>> {
    const map = new Map([[ethAddress, namesToCheck]])
    const result = await this.areNamesOwned(map)
    return result.get(ethAddress.toLowerCase())!
  }

  async areNamesOwned(check: Map<EthAddress, Name[]>): Promise<Map<EthAddress, Map<Name, Owned>>> {
    // Set up result
    const result: Map<EthAddress, Map<Name, Owned>> = new Map(
      Array.from(check.keys()).map((ethAddress) => [ethAddress.toLowerCase(), new Map()])
    )

    // We will keep the unknown names in 2 different structures, so that it is easier to use them later
    const unknown: Name[] = []
    const unknownMap: Map<EthAddress, Name[]> = new Map()

    // Check what is on the cache
    for (const [ethAddress, names] of check) {
      const lowerCaseAddress = ethAddress.toLowerCase()
      const ethAddressResult = result.get(lowerCaseAddress)!
      for (const name of names) {
        const owner = this.internalCache.get(name)
        if (owner === undefined) {
          unknown.push(name)
          const unknownNamesPerAddress = unknownMap.get(lowerCaseAddress)
          if (!unknownNamesPerAddress) {
            unknownMap.set(lowerCaseAddress, [name])
          } else {
            unknownNamesPerAddress.push(name)
          }
        } else {
          ethAddressResult.set(name, lowerCaseAddress === owner)
        }
      }
    }

    // Fetch owners for unknown names
    const graphFetchResult = await this.fetchActualOwners(unknown)

    // Store fetched data in the cache, and add missing information to the result
    for (const [ethAddress, names] of unknownMap) {
      const ethAddressResult = result.get(ethAddress)!
      for (const name of names) {
        const owner = graphFetchResult.get(name)
        this.internalCache.set(name, owner ?? null) // We are setting undefined values to null. This is so that we know we queried the data, and there is no owner
        ethAddressResult.set(name, owner === ethAddress)
      }
    }

    return result
  }

  private async fetchActualOwners(names: Name[]): Promise<Map<Name, EthAddress>> {
    const result: Map<Name, EthAddress> = new Map()
    let offset = 0
    while (offset < names.length) {
      const namesSlice = names.slice(offset, EnsOwnership.PAGE_SIZE)
      const owners = await this.fetchOwnedNames(namesSlice)
      for (const { name, owner } of owners) {
        result.set(name, owner)
      }
      offset += EnsOwnership.PAGE_SIZE
    }

    return result
  }

  /** This method will take a list of names and return only those that are owned by the given eth address */
  private async fetchOwnedNames(names: Name[]) {
    try {
      const response = await this.fetcher.queryGraph<{ nfts: { name: Name; owner: { address: EthAddress } }[] }>(
        this.theGraphBaseUrl,
        EnsOwnership.QUERY,
        {
          names
        }
      )
      return response.nfts.map(({ name, owner }) => ({ name, owner: owner.address }))
    } catch (error) {
      EnsOwnership.LOGGER.error(`Could not retrieve ENSs.`, error)
      return []
    }
  }
}

type Owned = boolean
type Name = string
