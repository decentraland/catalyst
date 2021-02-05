import { Fetcher } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import log4js from 'log4js'
import { NFTOwnership } from './NFTOwnership'

export class EnsOwnership extends NFTOwnership {
  private static readonly LOGGER = log4js.getLogger('EnsOwnership')
  private static readonly QUERY: string = `
    query FetchOwnersByName($names: [String]) {
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

  constructor(
    private readonly theGraphBaseUrl: string,
    private readonly fetcher: Fetcher,
    maxSize: number,
    maxAge: number
  ) {
    super(maxSize, maxAge)
  }

  /** This method will take a list of names and return only those that are owned by the given eth address */
  protected async querySubgraph(names: Name[]) {
    try {
      const response = await this.fetcher.queryGraph<{ nfts: { name: Name; owner: { address: EthAddress } }[] }>(
        this.theGraphBaseUrl,
        EnsOwnership.QUERY,
        {
          names
        }
      )
      return response.nfts.map(({ name, owner }) => ({ nft: name, owner: owner.address }))
    } catch (error) {
      EnsOwnership.LOGGER.error(`Could not retrieve ENSs.`, error)
      return []
    }
  }
}

type Name = string
