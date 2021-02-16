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

  public async findOwnersByWearable(wearables: WearableId[]): Promise<{ urn: string; owner: EthAddress }[]> {
    const query: Query<
      { nfts: { urn: string; owner: { address: EthAddress } }[] },
      { urn: string; owner: EthAddress }[]
    > = {
      description: 'fetch owners by wearable',
      subgraph: 'collectionsSubgraph',
      query: QUERY_OWNER_BY_WEARABLES,
      mapper: (response) => response.nfts.map(({ urn, owner }) => ({ urn, owner: owner.address })),
      default: []
    }
    return this.splitQueryVariablesIntoSlices(query, wearables, (slicedWearables) => ({ urns: slicedWearables }))
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

const QUERY_OWNER_BY_WEARABLES = `
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
