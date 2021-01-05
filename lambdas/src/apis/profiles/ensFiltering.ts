import { Fetcher } from 'dcl-catalyst-commons'
import { ENSFilteringCache } from './ENSFilteringCache'

export class ENSFilter {
  private cache: ENSFilteringCache
  private query: string = `
  query FilterNamesByOwner($owner: String, $names: [String]) {
      nfts(
          where: {
              owner: $owner,
              name_in: $names,
              category: ens }) {
          name
      }
  }`

  constructor(size?: number, maxAge?: number) {
    this.cache = new ENSFilteringCache(size, maxAge)
  }

  async filter(
    fetcher: Fetcher,
    theGraphBaseUrl: string,
    ethAddress: string,
    namesToFilter: string[]
  ): Promise<string[]> {
    return this.cache.get(ethAddress.toLowerCase(), namesToFilter, async (owner, names) => {
      return await this.getTheGraph(fetcher, theGraphBaseUrl, owner, names, ethAddress)
    })
  }

  private async getTheGraph(
    fetcher: Fetcher,
    theGraphBaseUrl: string,
    owner: string,
    names: string[],
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
    return []
  }
}
