import { EthAddress } from '@dcl/crypto'
import log4js from 'log4js'
import LRU from 'lru-cache'

/**
 * This is a custom cache for storing the owner of a given NFT. It can be configured with a max size of elements
 */
export abstract class NFTOwnership {
  private static readonly NFT_FRAGMENTS_PER_QUERY = 10
  private static readonly LOGGER = log4js.getLogger('NFTOwnership')

  // The cache lib returns undefined when no value was calculated at all
  private internalCache: LRU<NFTIdOwnerPair, Owned>

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

    // Place to store unknown NFTs
    const unknownMap: Map<EthAddress, NFTId[]> = new Map()

    // Check what is on the cache
    for (const [ethAddress, nfts] of check) {
      const lowerCaseAddress = ethAddress.toLowerCase()
      const ethAddressResult = result.get(lowerCaseAddress)!
      for (const nft of nfts) {
        const pair = this.buildOwnerIdPair(lowerCaseAddress, nft)
        const owned = this.internalCache.get(pair)
        if (owned === undefined) {
          // Unknown NFTS
          const unknownNFTsPerAddress = unknownMap.get(lowerCaseAddress)
          if (!unknownNFTsPerAddress) {
            unknownMap.set(lowerCaseAddress, [nft])
          } else {
            unknownNFTsPerAddress.push(nft)
          }
        } else {
          // NFT ownership already in cache
          ethAddressResult.set(nft, owned)
        }
      }
    }

    // Check ownership for unknown nfts
    const graphFetchResult = await this.checkForOwnership(unknownMap)

    // Store fetched data in the cache, and add missing information to the result
    for (const [ethAddress, nfts] of unknownMap) {
      const ethAddressResult = result.get(ethAddress)!
      const ownedNfts = graphFetchResult.get(ethAddress)
      for (const nft of nfts) {
        const pair = this.buildOwnerIdPair(ethAddress, nft)
        const owned = ownedNfts?.has(nft)
        if (owned !== undefined) {
          // Only cache the result if the subgraph actually responded
          this.internalCache.set(pair, owned)
        }
        // If the query to the subgraph failed, then consider the nft as owned
        ethAddressResult.set(nft, owned ?? true)
      }
    }

    return result
  }

  protected abstract querySubgraph(
    nftsToCheck: [EthAddress, NFTId[]][]
  ): Promise<{ owner: EthAddress; ownedNFTs: NFTId[] }[]>

  /** Return a set of the NFTs that are actually owned by the user */
  private async checkForOwnership(nftsToCheck: Map<EthAddress, NFTId[]>): Promise<Map<EthAddress, Set<NFTId>>> {
    const entries = Array.from(nftsToCheck.entries())
    const result: Map<EthAddress, Set<NFTId>> = new Map()
    let offset = 0
    while (offset < entries.length) {
      const slice = entries.slice(offset, offset + NFTOwnership.NFT_FRAGMENTS_PER_QUERY)
      try {
        const queryResult = await this.querySubgraph(slice)
        for (const { ownedNFTs, owner } of queryResult) {
          result.set(owner, new Set(ownedNFTs))
        }
      } catch (error) {
        NFTOwnership.LOGGER.warn(error)
      } finally {
        offset += NFTOwnership.NFT_FRAGMENTS_PER_QUERY
      }
    }

    return result
  }

  private buildOwnerIdPair(owner: EthAddress, nftId: NFTId): NFTIdOwnerPair {
    return `${owner}-${nftId}`
  }
}

type NFTIdOwnerPair = string
type Owned = boolean
type NFTId = string
