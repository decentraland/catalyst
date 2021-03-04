import { Fetcher } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import log4js from 'log4js'
import { WearableId, WearablesFilters } from '../apis/collections/types'

export class TheGraphClient {
  public static readonly MAX_PAGE_SIZE = 1000
  private static readonly LOGGER = log4js.getLogger('TheGraphClient')

  constructor(private readonly urls: URLs, private readonly fetcher: Fetcher) {}

  public async findOwnersByName(names: string[]): Promise<{ name: string; owner: EthAddress }[]> {
    const query: Query<
      { nfts: { name: string; owner: { address: EthAddress } }[] },
      { name: string; owner: EthAddress }[]
    > = {
      description: 'fetch owners by name',
      subgraph: 'ensSubgraph',
      query: QUERY_OWNER_BY_NAME,
      mapper: (response) => response.nfts.map(({ name, owner }) => ({ name, owner: owner.address })),
      default: []
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
      mapper,
      default: []
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

  public async checkForWearablesOwnership(
    wearableIdsToCheck: [EthAddress, string[]][]
  ): Promise<{ owner: EthAddress; urns: string[] }[]> {
    const subgraphQuery = `{` + wearableIdsToCheck.map((query) => this.getWearablesFragment(query)).join('\n') + `}`
    const mapper = (response: { [owner: string]: { urn: string }[] }) =>
      Object.entries(response).map(([addressWithPrefix, wearables]) => ({
        owner: addressWithPrefix.substring(1),
        urns: wearables.map(({ urn }) => urn)
      }))
    const query: Query<{ [owner: string]: { urn: string }[] }, { owner: EthAddress; urns: string[] }[]> = {
      description: 'check for wearables ownership',
      subgraph: 'collectionsSubgraph',
      query: subgraphQuery,
      mapper,
      default: []
    }
    return this.runQuery(query, {})
  }

  private getWearablesFragment([ethAddress, wearableIds]: [EthAddress, string[]]) {
    const urnList = wearableIds.map((wearableId) => `"${wearableId}"`).join(',')
    // We need to add a 'P' prefix, because the graph needs the fragment name to start with a letter
    return `
      P${ethAddress}: nfts(where: { owner: "${ethAddress}", searchItemType_in: ["wearable_v1", "wearable_v2"], urn_in: [${urnList}] }, first: 1000) {
        urn
      }
    `
  }

  public findWearablesByOwner(owner: EthAddress): Promise<WearableId[]> {
    const query: Query<{ nfts: { urn: string }[] }, WearableId[]> = {
      description: 'fetch wearables by owner',
      subgraph: 'collectionsSubgraph',
      query: QUERY_WEARABLES_BY_OWNER,
      mapper: (response) => response.nfts.map(({ urn }) => urn),
      default: []
    }
    return this.paginatableQuery(query, { owner: owner.toLowerCase() })
  }

  public findWearablesByFilters(filters: WearablesFilters, pagination: Pagination): Promise<WearableId[]> {
    const subgraphQuery = this.buildFilterQuery(filters)
    const query: Query<{ items: { urn: string }[] }, WearableId[]> = {
      description: 'fetch wearables by filters',
      subgraph: 'collectionsSubgraph',
      query: subgraphQuery,
      mapper: (response) => response.items.map(({ urn }) => urn),
      default: []
    }
    return this.runQuery(query, { ...filters, first: pagination.limit, skip: pagination.offset })
  }

  private buildFilterQuery(filters: WearablesFilters): string {
    const whereClause: string[] = [`searchItemType_in: ["wearable_v1", "wearable_v2"]`]
    const params: string[] = []
    if (filters.textSearch) {
      params.push('$textSearch: String')
      whereClause.push(`searchText_contains: $textSearch`)
    }

    if (filters.wearableIds) {
      params.push('$wearableIds: [String]!')
      whereClause.push(`urn_in: $wearableIds`)
    }

    if (filters.collectionIds) {
      params.push('$collectionIds: [String]!')
      whereClause.push(`collection_in: $collectionIds`)
    }

    return `
      query WearablesByFilters(${params.join(',')}, $first: Int!, $skip: Int!) {
        items(where: {${whereClause.join(',')}}, first: $first, skip: $skip) {
          urn
        }
      }`
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
        `Failed to execute the following query to the subgraph '${query.description}'.`,
        error
      )
      return query.default
    }
  }
}

const QUERY_WEARABLES_BY_OWNER: string = `
  query WearablesByOwner($owner: String, $first: Int, $skip: Int) {
    nfts(where: {owner: $owner, searchItemType_in: ["wearable_v1", "wearable_v2"]}, first: $first, skip: $skip) {
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

type Query<QueryResult, ReturnType> = {
  description: string
  subgraph: keyof URLs
  query: string
  mapper: (queryResult: QueryResult) => ReturnType
  default: ReturnType
}

type URLs = {
  ensSubgraph: string
  collectionsSubgraph: string
}

type Pagination = { offset: number; limit: number }
