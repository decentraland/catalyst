import { Fetcher } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import log4js from 'log4js'
import { NFTOwnership } from './NFTOwnership'

/**
 * This is a custom cache that stores wearables owned by a given user. It can be configured with a max size of elements
 */
export class WearablesOwnership extends NFTOwnership {
  private static readonly LOGGER = log4js.getLogger('WearablesOwnership')
  private static readonly QUERY: string = `
    query FetchOwnersByURN($urns: [String]) {
      nfts(
          where: {
              urn_in: $urns,
              searchItemType_in: ["wearable_v1", "wearable_v2"]
          })
      {
          urn
          owner {
            address
          }
      }
  }`

  constructor(
    private readonly theGraphBaseUrl: string,
    private readonly fetcher: Fetcher,
    maxSize: number,
    maxAge: number
  ) {
    super(maxSize, maxAge)
  }

  protected async querySubgraph(urns: string[]) {
    try {
      const response = await this.fetcher.queryGraph<{ nfts: { urn: string; owner: { address: EthAddress } }[] }>(
        this.theGraphBaseUrl,
        WearablesOwnership.QUERY,
        {
          urns
        }
      )
      return response.nfts.map(({ urn, owner }) => ({ nft: urn, owner: owner.address }))
    } catch (error) {
      WearablesOwnership.LOGGER.error(`Could not retrieve Wearables.`, error)
      return []
    }
  }
}
