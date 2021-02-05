import { EthAddress } from 'dcl-crypto'
import LRU from 'lru-cache'

/**
 * This is a custom cache for storing the owner of a given NFT. It can be configured with a max size of elements
 */
export abstract class NFTOwnership {
  private static readonly PAGE_SIZE = 1000 // The graph has a 1000 limit when return the response

  // The cache lib returns undefined when no value was calculated at all. We will set a 'null' value when we checked the blockchain, and there was no owner
  private internalCache: LRU<NFTId, EthAddress | null>

  constructor(maxSize: number, maxAge: number) {
    this.internalCache = new LRU({ max: maxSize, maxAge })
  }

  async areNFTsOwnedByAddress(ethAddress: EthAddress, idsToCheck: NFTId[]): Promise<Map<NFTId, Owned>> {
    const map = new Map([[ethAddress, idsToCheck]])
    const result = await this.areNFTsOwned(map)
    return result.get(ethAddress.toLowerCase())!
  }

  async areNFTsOwned(check: Map<EthAddress, NFTId[]>): Promise<Map<EthAddress, Map<NFTId, Owned>>> {
    // Set up result
    const result: Map<EthAddress, Map<NFTId, Owned>> = new Map(
      Array.from(check.keys()).map((ethAddress) => [ethAddress.toLowerCase(), new Map()])
    )

    // We will keep the unknown nfts in 2 different structures, so that it is easier to use them later
    const unknown: NFTId[] = []
    const unknownMap: Map<EthAddress, NFTId[]> = new Map()

    // Check what is on the cache
    for (const [ethAddress, nfts] of check) {
      const lowerCaseAddress = ethAddress.toLowerCase()
      const ethAddressResult = result.get(lowerCaseAddress)!
      for (const nft of nfts) {
        const owner = this.internalCache.get(nft)
        if (owner === undefined) {
          unknown.push(nft)
          const unknownNFTsPerAddress = unknownMap.get(lowerCaseAddress)
          if (!unknownNFTsPerAddress) {
            unknownMap.set(lowerCaseAddress, [nft])
          } else {
            unknownNFTsPerAddress.push(nft)
          }
        } else {
          ethAddressResult.set(nft, lowerCaseAddress === owner)
        }
      }
    }

    // Fetch owners for unknown nfts
    const graphFetchResult = await this.fetchActualOwners(unknown)

    // Store fetched data in the cache, and add missing information to the result
    for (const [ethAddress, nfts] of unknownMap) {
      const ethAddressResult = result.get(ethAddress)!
      for (const nfs of nfts) {
        const owner = graphFetchResult.get(nfs)
        this.internalCache.set(nfs, owner ?? null) // We are setting undefined values to null. This is so that we know we queried the data, and there is no owner
        ethAddressResult.set(nfs, owner === ethAddress)
      }
    }

    return result
  }

  protected abstract querySubgraph(ids: NFTId[]): Promise<{ nft: NFTId; owner: EthAddress }[]>

  private async fetchActualOwners(ids: NFTId[]): Promise<Map<NFTId, EthAddress>> {
    const result: Map<NFTId, EthAddress> = new Map()
    let offset = 0
    while (offset < ids.length) {
      const slice = ids.slice(offset, offset + NFTOwnership.PAGE_SIZE)
      const owners = await this.querySubgraph(slice)
      for (const { nft, owner } of owners) {
        result.set(nft, owner)
      }
      offset += NFTOwnership.PAGE_SIZE
    }

    return result
  }
}

type Owned = boolean
type NFTId = string
