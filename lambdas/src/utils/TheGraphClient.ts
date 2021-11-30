import { parseUrn } from '@dcl/urn-resolver'
import { Fetcher } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import log4js from 'log4js'
import { WearableId, WearablesFilters } from '../apis/collections/types'

export class TheGraphClient {
  public static readonly MAX_PAGE_SIZE = 1000
  private static readonly LOGGER = log4js.getLogger('TheGraphClient')

  constructor(private readonly urls: URLs, private readonly fetcher: Fetcher) { }

  public async findOwnersByName(names: string[]): Promise<{ name: string; owner: EthAddress }[]> {
    const query: Query<
      { nfts: { name: string; owner: { address: EthAddress } }[] },
      { name: string; owner: EthAddress }[]
    > = {
      description: 'fetch owners by name',
      subgraph: 'ensSubgraph',
      query: QUERY_OWNER_BY_NAME,
      mapper: (response) => response.nfts.map(({ name, owner }) => ({ name, owner: owner.address }))
    }
    return this.splitQueryVariablesIntoSlices(query, names, (slicedNames) => ({ names: slicedNames }))
  }

  public async checkForNamesOwnership(
    namesToCheck: [EthAddress, string[]][]
  ): Promise<{ owner: EthAddress; names: string[] }[]> {
    const subgraphQuery = `{` + namesToCheck.map((query) => this.getNamesFragment(query)).join('\n') + `}`
    const mapper = (response: { [owner: string]: { name: string }[] }) =>
      Object.entries(response).map(([addressWithPrefix, names]) => ({
        owner: addressWithPrefix.substring(1),
        names: names.map(({ name }) => name)
      }))
    const query: Query<{ [owner: string]: { name: string }[] }, { owner: EthAddress; names: string[] }[]> = {
      description: 'check for names ownership',
      subgraph: 'ensSubgraph',
      query: subgraphQuery,
      mapper
    }
    return this.runQuery(query, {})
  }

  private getNamesFragment([ethAddress, names]: [EthAddress, string[]]) {
    const nameList = names.map((name) => `"${name}"`).join(',')
    // We need to add a 'P' prefix, because the graph needs the fragment name to start with a letter
    return `
      P${ethAddress}: nfts(where: { owner: "${ethAddress}", category: ens, name_in: [${nameList}] }, first: 1000) {
        name
      }
    `
  }

  /**
   * This method returns all the owners from the given wearables URNs. It looks for them first in Ethereum and then in Matic
   * @param wearableIdsToCheck pairs of ethAddress and a list of urns to check ownership
   * @returns the pairs of ethAddress and list of urns
   */
  public async checkForWearablesOwnership(
    wearableIdsToCheck: [EthAddress, string[]][]
  ): Promise<{ owner: EthAddress; urns: string[] }[]> {
    const ethereumWearablesOwnersPromise = this.getOwnedWearables(wearableIdsToCheck, 'collectionsSubgraph')
    const maticWearablesOwnersPromise = this.getOwnedWearables(wearableIdsToCheck, 'maticCollectionsSubgraph')

    const [ethereumWearablesOwners, maticWearablesOwners] = await Promise.all([
      ethereumWearablesOwnersPromise,
      maticWearablesOwnersPromise
    ])

    return this.concatWearables(ethereumWearablesOwners, maticWearablesOwners)
  }

  public async getAllCollections(): Promise<{ name: string; urn: string }[]> {
    const l1CollectionsPromise = this.getCollections('collectionsSubgraph')
    const l2CollectionsPromise = this.getCollections('maticCollectionsSubgraph')

    const [l1Collections, l2Collections] = await Promise.all([l1CollectionsPromise, l2CollectionsPromise])
    return l1Collections.concat(l2Collections)
  }

  private async getCollections(subgraph: keyof URLs) {
    try {
      const query: Query<{ collections: { name: string; urn: string }[] }, { name: string; urn: string }[]> = {
        description: 'fetch collections',
        subgraph: subgraph,
        query: QUERY_COLLECTIONS,
        mapper: (response) => response.collections
      }
      return this.runQuery(query, {})
    } catch {
      return []
    }
  }

  private concatWearables(
    ethereumWearablesOwners: { owner: EthAddress; urns: string[] }[],
    maticWearablesOwners: { owner: EthAddress; urns: string[] }[]
  ) {
    const allWearables: Map<string, string[]> = new Map<string, string[]>()

    ethereumWearablesOwners.forEach((a) => {
      allWearables.set(a.owner, a.urns)
    })
    maticWearablesOwners.forEach((b) => {
      const existingUrns = allWearables.get(b.owner) ?? []
      allWearables.set(b.owner, existingUrns.concat(b.urns))
    })

    return Array.from(allWearables.entries()).map(([owner, urns]) => ({ owner, urns }))
  }

  private async getOwnedWearables(
    wearableIdsToCheck: [string, string[]][],
    subgraph: keyof URLs
  ): Promise<{ owner: EthAddress; urns: string[] }[]> {
    try {
      return this.getOwnersByWearable(wearableIdsToCheck, subgraph)
    } catch (error) {
      TheGraphClient.LOGGER.error(error)
      return []
    }
  }

  private getOwnersByWearable(
    wearableIdsToCheck: [string, string[]][],
    subgraph: keyof URLs
  ): Promise<{ owner: EthAddress; urns: string[] }[]> {
    const subgraphQuery = `{` + wearableIdsToCheck.map((query) => this.getWearablesFragment(query)).join('\n') + `}`
    const mapper = (response: { [owner: string]: { urn: string }[] }) =>
      Object.entries(response).map(([addressWithPrefix, wearables]) => ({
        owner: addressWithPrefix.substring(1),
        urns: wearables.map(({ urn }) => urn)
      }))
    const query: Query<{ [owner: string]: { urn: string }[] }, { owner: EthAddress; urns: string[] }[]> = {
      description: 'check for wearables ownership',
      subgraph: subgraph,
      query: subgraphQuery,
      mapper
    }
    return this.runQuery(query, {})
  }

  private getWearablesFragment([ethAddress, wearableIds]: [EthAddress, string[]]) {
    const urnList = wearableIds.map((wearableId) => `"${wearableId}"`).join(',')
    // We need to add a 'P' prefix, because the graph needs the fragment name to start with a letter
    return `
      P${ethAddress}: nfts(where: { owner: "${ethAddress}", searchItemType_in: ["wearable_v1", "wearable_v2", "smart_wearable_v2"], urn_in: [${urnList}] }, first: 1000) {
        urn
      }
    `
  }

  /**
   * Given an ethereum address, this method returns all wearables from ethereum and matic that are asociated to it.
   * @param owner
   */
  public async findWearablesByOwner(owner: EthAddress): Promise<WearableId[]> {
    const ethereumWearablesPromise = this.getWearablesByOwner('collectionsSubgraph', owner)
    const maticWearablesPromise = this.getWearablesByOwner('maticCollectionsSubgraph', owner)
    const [ethereumWearables, maticWearables] = await Promise.all([ethereumWearablesPromise, maticWearablesPromise])

    return ethereumWearables.concat(maticWearables)
  }

  private async getWearablesByOwner(subgraph: keyof URLs, owner: string) {
    const query: Query<{ nfts: { urn: string }[] }, WearableId[]> = {
      description: 'fetch wearables by owner',
      subgraph: subgraph,
      query: QUERY_WEARABLES_BY_OWNER,
      mapper: (response) => response.nfts.map(({ urn }) => urn)
    }
    return this.paginatableQuery(query, { owner: owner.toLowerCase() })
  }

  public async findWearablesByFilters(
    filters: WearablesFilters,
    pagination: { limit: number; lastId: string | undefined }
  ): Promise<WearableId[]> {
    // Order will be L1 > L2
    const L1_NETWORKS = ['mainnet', 'ropsten', 'kovan', 'rinkeby', 'goerli']
    const L2_NETWORKS = ['matic', 'mumbai']

    let limit = pagination.limit
    let lastId = pagination.lastId
    let lastIdLayer: string | undefined = lastId ? await this.getProtocol(lastId) : undefined

    const result: WearableId[] = []

    if (limit >= 0 && (!lastIdLayer || L1_NETWORKS.includes(lastIdLayer))) {
      const l1Result = await this.findWearablesByFiltersInSubgraph(
        'collectionsSubgraph',
        { ...filters, lastId },
        limit + 1
      )
      result.push(...l1Result)
      limit -= l1Result.length
      lastId = undefined
      lastIdLayer = undefined
    }

    if (limit >= 0 && (!lastIdLayer || L2_NETWORKS.includes(lastIdLayer))) {
      const l2Result = await this.findWearablesByFiltersInSubgraph(
        'maticCollectionsSubgraph',
        { ...filters, lastId },
        limit + 1
      )
      result.push(...l2Result)
    }

    return result
  }

  private async getProtocol(urn: string) {
    const parsed = await parseUrn(urn)
    return parsed?.type === 'blockchain-collection-v1-asset' || parsed?.type === 'blockchain-collection-v2-asset'
      ? parsed.network
      : undefined
  }

  private findWearablesByFiltersInSubgraph(
    subgraph: keyof URLs,
    filters: WearablesFilters & { lastId?: string },
    limit: number
  ): Promise<WearableId[]> {
    const subgraphQuery = this.buildFilterQuery(filters)
    let mapper: (response: any) => WearableId[]
    if (filters.collectionIds) {
      mapper = (response: { collections: { items: { urn: string }[] }[] }) =>
        response.collections.map(({ items }) => items.map(({ urn }) => urn)).flat()
    } else {
      mapper = (response: { items: { urn: string }[] }) => response.items.map(({ urn }) => urn)
    }
    const query = {
      description: 'fetch wearables by filters',
      subgraph,
      query: subgraphQuery,
      mapper,
      default: []
    }

    return this.runQuery(query, { ...filters, lastId: filters.lastId ?? '', first: limit })
  }

  private buildFilterQuery(filters: WearablesFilters & { lastId?: string }): string {
    const whereClause: string[] = [`searchItemType_in: ["wearable_v1", "wearable_v2", "smart_wearable_v2"]`]
    const params: string[] = []
    if (filters.textSearch) {
      params.push('$textSearch: String')
      whereClause.push(`searchText_contains: $textSearch`)
    }

    if (filters.wearableIds) {
      params.push('$wearableIds: [String]!')
      whereClause.push(`urn_in: $wearableIds`)
    }

    if (filters.lastId) {
      params.push('$lastId: String!')
      whereClause.push(`urn_gt: $lastId`)
    }

    const itemsQuery = `
      items(where: {${whereClause.join(',')}}, first: $first, orderBy: urn, orderDirection: asc) {
        urn
      }
    `

    if (filters.collectionIds) {
      params.push('$collectionIds: [String]!')

      return `
        query WearablesByFilters(${params.join(',')}, $first: Int!) {
          collections(where: { urn_in: $collectionIds }, first: 1000, orderBy: urn, orderDirection: asc) {
            ${itemsQuery}
          }
        }`
    } else {
      return `
        query WearablesByFilters(${params.join(',')}, $first: Int!) {
          ${itemsQuery}
        }`
    }
  }

  /** This method takes a query that could be paginated and performs the pagination internally */
  private async paginatableQuery<QueryResult, ReturnType extends Array<any>>(
    query: Query<QueryResult, ReturnType>,
    variables: Record<string, any>
  ): Promise<ReturnType> {
    let result: ReturnType | undefined = undefined
    let shouldContinue = true
    let offset = 0
    while (shouldContinue) {
      const queried = await this.runQuery(query, { ...variables, first: TheGraphClient.MAX_PAGE_SIZE, skip: offset })
      if (!result) {
        result = queried
      } else {
        result.push(...queried)
      }
      shouldContinue = queried.length === TheGraphClient.MAX_PAGE_SIZE
      offset += TheGraphClient.MAX_PAGE_SIZE
    }
    return result!
  }

  /**
   * This method takes a query that has an array input variable, and makes multiple queries if necessary.
   * This is so that the input doesn't exceed the maximum limit
   */
  private async splitQueryVariablesIntoSlices<QueryResult, ReturnType extends Array<any>>(
    query: Query<QueryResult, ReturnType>,
    input: string[],
    inputToVariables: (input: string[]) => Record<string, any>
  ): Promise<ReturnType | []> {
    let result: ReturnType | undefined = undefined
    let offset = 0
    while (offset < input.length) {
      const slice = input.slice(offset, offset + TheGraphClient.MAX_PAGE_SIZE)
      const queried = await this.runQuery(query, inputToVariables(slice))
      if (!result) {
        result = queried
      } else {
        result.push(...queried)
      }
      offset += TheGraphClient.MAX_PAGE_SIZE
    }
    return result ?? []
  }

  private async runQuery<QueryResult, ReturnType>(
    query: Query<QueryResult, ReturnType>,
    variables: Record<string, any>
  ): Promise<ReturnType> {
    try {
      const response = await this.fetcher.queryGraph<QueryResult>(this.urls[query.subgraph], query.query, variables)
      return query.mapper(response)
    } catch (error) {
      TheGraphClient.LOGGER.error(
        `Failed to execute the following query to the subgraph ${this.urls[query.subgraph]} ${query.description}'.`,
        error
      )
      throw new Error('Internal server error')
    }
  }
}

const QUERY_WEARABLES_BY_OWNER: string = `
  query WearablesByOwner($owner: String, $first: Int, $skip: Int) {
    nfts(where: {owner: $owner, searchItemType_in: ["wearable_v1", "wearable_v2", "smart_wearable_v2"]}, first: $first, skip: $skip) {
      urn
    }
  }`

const QUERY_OWNER_BY_NAME = `
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

// NOTE: Even though it isn't necessary right now, we might require some pagination in the future
const QUERY_COLLECTIONS = `
  {
    collections (first: 1000, orderBy: urn, orderDirection: asc) {
      urn,
      name,
    }
  }`

type Query<QueryResult, ReturnType> = {
  description: string
  subgraph: keyof URLs
  query: string
  mapper: (queryResult: QueryResult) => ReturnType
}

type URLs = {
  ensSubgraph: string
  collectionsSubgraph: string
  maticCollectionsSubgraph: string
}
