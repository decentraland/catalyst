import { EthAddress } from '@dcl/crypto'
import { parseUrn } from '@dcl/urn-resolver'
import { Fetcher } from 'dcl-catalyst-commons'
import log4js from 'log4js'
import {
  EmoteId,
  ItemFilters,
  ThirdPartyIntegration,
  WearableId
} from '../controllers/handlers/collections/utils/types'

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
   * @param itemIdsToCheck pairs of ethAddress and a list of urns to check ownership
   * @returns the pairs of ethAddress and list of urns
   */
  public async checkForItemsOwnership(
    itemIdsToCheck: [EthAddress, string[]][],
    itemTypes: BlockchainItemType[]
  ): Promise<{ owner: EthAddress; urns: string[] }[]> {
    const ethereumWearablesOwnersPromise = this.getOwnedItems(itemIdsToCheck, 'collectionsSubgraph', itemTypes)
    const maticWearablesOwnersPromise = this.getOwnedItems(itemIdsToCheck, 'maticCollectionsSubgraph', itemTypes)

    const [ethereumWearablesOwners, maticWearablesOwners] = await Promise.all([
      ethereumWearablesOwnersPromise,
      maticWearablesOwnersPromise
    ])

    return this.concatItems(ethereumWearablesOwners, maticWearablesOwners)
  }

  private async getOwnedItems(
    itemIdsToCheck: [string, string[]][],
    subgraph: keyof URLs,
    itemTypes: BlockchainItemType[]
  ): Promise<{ owner: EthAddress; urns: string[] }[]> {
    try {
      return this.getOwnersByItem(itemIdsToCheck, subgraph, itemTypes)
    } catch (error) {
      TheGraphClient.LOGGER.error(error)
      return []
    }
  }

  private getOwnersByItem(
    itemIdsToCheck: [string, string[]][],
    subgraph: keyof URLs,
    itemTypes: BlockchainItemType[]
  ): Promise<{ owner: EthAddress; urns: string[] }[]> {
    const subgraphQuery = `{` + itemIdsToCheck.map((query) => this.getItemsFragment(query, itemTypes)).join('\n') + `}`
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

  private getItemsFragment([ethAddress, itemIds]: [EthAddress, string[]], itemTypes: BlockchainItemType[]) {
    const urnList = itemIds.map((wearableId) => `"${wearableId}"`).join(',')
    // We need to add a 'P' prefix, because the graph needs the fragment name to start with a letter
    return `
      P${ethAddress}: nfts(where: { owner: "${ethAddress}", searchItemType_in: ${JSON.stringify(
      itemTypes
    )}, urn_in: [${urnList}] }, first: 1000) {
        urn
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
    return this.checkForItemsOwnership(wearableIdsToCheck, WEARABLE_TYPES)
  }

  public async checkForEmotesOwnership(
    emoteIdsToCheck: [EthAddress, string[]][]
  ): Promise<{ owner: EthAddress; urns: string[] }[]> {
    return this.checkForItemsOwnership(emoteIdsToCheck, EMOTE_TYPES)
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

  private concatItems(
    ethereumItemsOwners: { owner: EthAddress; urns: string[] }[],
    maticItemOwners: { owner: EthAddress; urns: string[] }[]
  ) {
    const allItems: Map<string, string[]> = new Map<string, string[]>()

    ethereumItemsOwners.forEach((a) => {
      allItems.set(a.owner, a.urns)
    })
    maticItemOwners.forEach((b) => {
      const existingUrns = allItems.get(b.owner) ?? []
      allItems.set(b.owner, existingUrns.concat(b.urns))
    })

    return Array.from(allItems.entries()).map(([owner, urns]) => ({ owner, urns }))
  }

  /**
   * This method returns the list of third party integrations as well as collections
   */
  public async getThirdPartyIntegrations(): Promise<ThirdPartyIntegration[]> {
    const query: Query<
      { thirdParties: { id: string; metadata: { thirdParty: { name: string; description: string } } }[] },
      ThirdPartyIntegration[]
    > = {
      description: 'fetch third parties',
      subgraph: 'thirdPartyRegistrySubgraph',
      query: QUERY_THIRD_PARTIES,
      mapper: (response) => response.thirdParties.map((tp) => ({ urn: tp.id, ...tp.metadata.thirdParty }))
    }
    return this.runQuery(query, { thirdPartyType: 'third_party_v1' })
  }

  /**
   * This method returns the third party resolver API to be used to query assets from any collection
   * of given third party integration
   */
  public async findThirdPartyResolver(subgraph: keyof URLs, id: string): Promise<string | undefined> {
    const query: Query<{ thirdParties: [{ resolver: string }] }, string | undefined> = {
      description: 'fetch third party resolver',
      subgraph: subgraph,
      query: QUERY_THIRD_PARTY_RESOLVER,
      mapper: (response) => response.thirdParties[0]?.resolver
    }
    return await this.runQuery(query, { id })
  }

  /**
   * Given an ethereum address, this method returns all wearables from ethereum and matic that are asociated to it.
   * @param owner
   */
  public async findWearableUrnsByOwner(owner: EthAddress): Promise<WearableId[]> {
    return this.findItemsByOwner(owner, WEARABLE_TYPES)
  }

  /**
   * Given an ethereum address, this method returns all wearables from ethereum and matic that are asociated to it.
   * @param owner
   */
  public async findEmoteUrnsByOwner(owner: EthAddress): Promise<EmoteId[]> {
    return this.findItemsByOwner(owner, EMOTE_TYPES)
  }

  public async findWearableUrnsByFilters(
    filters: ItemFilters,
    pagination: { limit: number; lastId: string | undefined }
  ): Promise<WearableId[]> {
    // Order will be L1 > L2
    const L1_NETWORKS = ['mainnet', 'ropsten', 'kovan', 'rinkeby', 'goerli']
    const L2_NETWORKS = ['matic', 'mumbai']
    const wearableTypes: BlockchainItemType[] = ['wearable_v1', 'wearable_v2', 'smart_wearable_v1', 'emote_v1']

    let limit = pagination.limit
    let lastId = pagination.lastId
    let lastIdLayer: string | undefined = lastId ? await this.getProtocol(lastId) : undefined

    const result: WearableId[] = []

    if (limit >= 0 && (!lastIdLayer || L1_NETWORKS.includes(lastIdLayer))) {
      const l1Result = await this.findItemUrnsByFiltersInSubgraph(
        'collectionsSubgraph',
        { ...filters, lastId },
        limit + 1,
        wearableTypes
      )
      result.push(...l1Result)
      limit -= l1Result.length
      lastId = undefined
      lastIdLayer = undefined
    }

    if (limit >= 0 && (!lastIdLayer || L2_NETWORKS.includes(lastIdLayer))) {
      const l2Result = await this.findItemUrnsByFiltersInSubgraph(
        'maticCollectionsSubgraph',
        { ...filters, lastId },
        limit + 1,
        wearableTypes
      )
      result.push(...l2Result)
    }

    return result
  }

  public async findEmoteUrnsByFilters(
    filters: ItemFilters,
    pagination: { limit: number; lastId: string | undefined }
  ): Promise<EmoteId[]> {
    // Order will be L1 > L2
    const L1_NETWORKS = ['mainnet', 'ropsten', 'kovan', 'rinkeby', 'goerli']
    const L2_NETWORKS = ['matic', 'mumbai']
    const emoteTypes: BlockchainItemType[] = ['emote_v1']

    let limit = pagination.limit
    let lastId = pagination.lastId
    let lastIdLayer: string | undefined = lastId ? await this.getProtocol(lastId) : undefined

    const result: WearableId[] = []

    if (limit >= 0 && (!lastIdLayer || L1_NETWORKS.includes(lastIdLayer))) {
      const l1Result = await this.findItemUrnsByFiltersInSubgraph(
        'collectionsSubgraph',
        { ...filters, lastId },
        limit + 1,
        emoteTypes
      )
      result.push(...l1Result)
      limit -= l1Result.length
      lastId = undefined
      lastIdLayer = undefined
    }

    if (limit >= 0 && (!lastIdLayer || L2_NETWORKS.includes(lastIdLayer))) {
      const l2Result = await this.findItemUrnsByFiltersInSubgraph(
        'maticCollectionsSubgraph',
        { ...filters, lastId },
        limit + 1,
        emoteTypes
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

  private findItemUrnsByFiltersInSubgraph(
    subgraph: keyof URLs,
    filters: ItemFilters & { lastId?: string },
    limit: number,
    itemTypes: BlockchainItemType[]
  ): Promise<(WearableId | EmoteId)[]> {
    const subgraphQuery = this.buildItemUrnFilterQuery(filters, itemTypes)
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

  private buildItemUrnFilterQuery(filters: ItemFilters & { lastId?: string }, itemTypes: BlockchainItemType[]): string {
    const whereClause: string[] = [`searchItemType_in: ${JSON.stringify(itemTypes)}`]
    const params: string[] = []
    if (filters.textSearch) {
      params.push('$textSearch: String')
      whereClause.push(`searchText_contains: $textSearch`)
    }

    if (filters.itemIds) {
      params.push('$ids: [String]!')
      whereClause.push(`urn_in: $ids`)
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

  private async findItemsByOwner(
    owner: EthAddress,
    itemTypes: BlockchainItemType[]
  ): Promise<(WearableId | EmoteId)[]> {
    const ethereumWearablesPromise = this.getItemsByOwner('collectionsSubgraph', owner, itemTypes)
    const maticWearablesPromise = this.getItemsByOwner('maticCollectionsSubgraph', owner, itemTypes)
    const [ethereumWearables, maticWearables] = await Promise.all([ethereumWearablesPromise, maticWearablesPromise])

    return ethereumWearables.concat(maticWearables)
  }

  private async getItemsByOwner(subgraph: keyof URLs, owner: string, itemTypes: BlockchainItemType[]) {
    const query: Query<
      { nfts: { id: string; urn: string; collection: { isApproved: boolean } }[] },
      { id: string; urn: string; isApproved: boolean }[]
    > = {
      description: `fetch items (${itemTypes}) by owner`,
      subgraph: subgraph,
      query: QUERY_ITEMS_BY_OWNER,
      mapper: (response) =>
        response.nfts.map(({ id, urn, collection }) => ({ id: id, urn: urn, isApproved: collection.isApproved }))
    }
    const items = await this.paginatableQuery(query, { owner: owner.toLowerCase(), item_types: itemTypes })
    return items.filter((item) => item.isApproved).map((item) => item.urn)
  }

  /** This method takes a query that could be paginated and performs the pagination internally */
  private async paginatableQuery<QueryResult, ReturnType extends Array<any>>(
    query: Query<QueryResult, ReturnType>,
    variables: Record<string, any>
  ): Promise<ReturnType> {
    let result: ReturnType | undefined = undefined
    let shouldContinue = true
    let start = ''
    while (shouldContinue) {
      const queried = await this.runQuery(query, { ...variables, first: TheGraphClient.MAX_PAGE_SIZE, start: start })
      if (!result) {
        result = queried
      } else {
        result.push(...queried)
      }
      start = queried[queried.length - 1]?.id
      shouldContinue = queried.length === TheGraphClient.MAX_PAGE_SIZE && !!start
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

const QUERY_THIRD_PARTIES = `
{
  thirdParties(where: {isApproved: true}) {
    id
		metadata {
      thirdParty {
        name
        description
      }
    }
  }
}
`

const QUERY_THIRD_PARTY_RESOLVER = `
query ThirdPartyResolver($id: String!) {
  thirdParties(where: {id: $id, isApproved: true}) {
    id
    resolver
  }
}
`

const QUERY_ITEMS_BY_OWNER: string = `
query itemsByOwner($owner: String, $item_types:[String], $first: Int, $start: String) {
  nfts(where: {owner: $owner, searchItemType_in: $item_types, id_gt: $start}, first: $first) {
    id
    urn
    collection {
      isApproved
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
  thirdPartyRegistrySubgraph: string
}

type BlockchainItemType = 'wearable_v1' | 'wearable_v2' | 'smart_wearable_v1' | 'emote_v1'

const WEARABLE_TYPES: BlockchainItemType[] = ['wearable_v1', 'wearable_v2', 'smart_wearable_v1', 'emote_v1']

const EMOTE_TYPES: BlockchainItemType[] = ['emote_v1']
