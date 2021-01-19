import { Fetcher } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import log4js from 'log4js'
import LRU from 'lru-cache'
import { WearableId } from '../collections/controllers/collections'

/**
 * This is a custom cache for the wearables owned by a given user. It can be configured with a max size of elements
 */
export class WearablesOwnership {
  private static readonly PAGE_SIZE = 1000 // The graph has a 1000 limit when return the response
  private static readonly REQUESTS_IN_GROUP = 10 // The amount of wearables requests we will group together
  private static LOGGER = log4js.getLogger('WearablesOwnership')

  private internalCache: LRU<EthAddress, { owned: Set<WearableId>; lastUpdated: Timestamp }>

  constructor(
    private readonly theGraphBaseUrl: string,
    private readonly fetcher: Fetcher,
    maxSize: number,
    maxAge: number
  ) {
    this.internalCache = new LRU({ max: maxSize, maxAge })
  }

  async getWearablesOwnedByAddresses(
    ethAddresses: EthAddress[]
  ): Promise<Map<EthAddress, { wearables: Set<WearableId>; updatedMillisAgo: number }>> {
    // Set up result
    const result: Map<EthAddress, { wearables: Set<WearableId>; updatedMillisAgo: number }> = new Map()

    // Check what is on the cache
    const unknown: EthAddress[] = []
    const now = Date.now()
    for (const ethAddress of ethAddresses) {
      const lowerCaseAddress = ethAddress.toLowerCase()
      const knownWearables = this.internalCache.get(lowerCaseAddress)
      if (knownWearables !== undefined) {
        result.set(lowerCaseAddress, {
          wearables: knownWearables.owned,
          updatedMillisAgo: now - knownWearables.lastUpdated
        })
      } else {
        unknown.push(lowerCaseAddress)
      }
    }

    // Fetch wearables for unknown addresses
    const graphFetchResult = await this.fetchWearablesForAddresses(unknown)

    // Store fetched data in the cache, and add missing information to the result
    for (const [lowerCaseAddress, wearables] of graphFetchResult) {
      this.internalCache.set(lowerCaseAddress, { owned: wearables, lastUpdated: Date.now() })
      result.set(lowerCaseAddress, { wearables, updatedMillisAgo: 0 })
    }

    return result
  }

  private async fetchWearablesForAddresses(addresses: EthAddress[]): Promise<Map<EthAddress, Set<WearableId>>> {
    const result: Map<EthAddress, Set<WearableId>> = new Map()

    const calls: GraphCall[] = addresses.map((ethAddress) => ({
      ethAddress,
      offset: 0,
      limit: WearablesOwnership.PAGE_SIZE
    }))

    let index = 0
    while (index < calls.length) {
      // Group many requests together, to reduce the amount of calls to the graph
      const callsToMake = calls.slice(index, index + WearablesOwnership.REQUESTS_IN_GROUP)
      const wearablesData = await this.fetchWearableData(callsToMake)

      for (const { owner, wearables } of wearablesData) {
        if (wearables.length === WearablesOwnership.PAGE_SIZE) {
          // If the amount of wearables is at the limit, then we need to make another call to get the remaining wearables
          const previousCall = callsToMake.find((call) => call.ethAddress === owner)!
          calls.push({
            ethAddress: owner,
            offset: previousCall.offset + WearablesOwnership.PAGE_SIZE,
            limit: WearablesOwnership.PAGE_SIZE
          })
        }

        // Add finding to the result
        const wearablesForAddress = result.get(owner)
        if (wearablesForAddress) {
          wearables.forEach((wearable) => wearablesForAddress.add(wearable))
        } else {
          result.set(owner, new Set(wearables))
        }
      }
      index += WearablesOwnership.REQUESTS_IN_GROUP
    }

    return result
  }

  /** This method will take a list of names and return only those that are owned by the given eth address */
  private async fetchWearableData(callsToMake: GraphCall[]): Promise<{ owner: EthAddress; wearables: WearableId[] }[]> {
    try {
      const query = `{` + callsToMake.map((call) => this.getFragment(call)).join('\n') + `}`
      const response = await this.fetcher.queryGraph<{
        [addressWithPrefix: string]: { catalystPointer: WearableId }[]
      }>(this.theGraphBaseUrl, query, {})
      return Object.entries(response).map(([addressWithPrefix, wearables]) => ({
        owner: addressWithPrefix.substring(1),
        wearables: wearables.map(({ catalystPointer }) => catalystPointer)
      }))
    } catch (error) {
      const fetchedEthAddresses = callsToMake.map(({ ethAddress }) => ethAddress).join(',')
      WearablesOwnership.LOGGER.error(`Could not retrieve for '${fetchedEthAddresses}'.`, error)
      return []
    }
  }

  private getFragment(call: GraphCall) {
    // We need to add a 'P' prefix, because the graph needs the fragment name to start with a letter
    // TODO: Add filtering so only wearables are searched
    return `
      P${call.ethAddress}: nfts(where: {owner: "${call.ethAddress}"}, first: ${call.limit}, skip: ${call.offset}) {
        catalystPointer
      }
    `
  }
}

type GraphCall = { ethAddress: EthAddress; offset: number; limit: number }
type Timestamp = number
