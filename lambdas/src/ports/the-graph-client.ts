import { EthAddress } from '@dcl/crypto'
import { WearableId } from '@dcl/schemas'
import { parseUrn } from '@dcl/urn-resolver'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { EmoteId, ItemFilters, ThirdPartyIntegration } from '../apis/collections/types'
import { COLLECTIONS, ITEMS_BY_OWNER, THIRD_PARTIES, THIRD_PARTY_RESOLVER } from './the-graph/queries'
import { BlockchainItemType, Query, SubGraphs, TheGraphClient } from './the-graph/types'

/**
 * Prefix needed since The Graph
 * expects the fragment
 * to start with a letter.
 */
const THE_GRAPH_PREFIX = 'P'

const EMOTE_TYPES: BlockchainItemType[] = ['emote_v1']

const WEARABLE_TYPES: BlockchainItemType[] = ['wearable_v1', 'wearable_v2', 'smart_wearable_v1']

const MAX_PAGE_SIZE = 1000

export async function createTheGraphClient(components: {
  subgraphs: SubGraphs
  log: ILoggerComponent
}): Promise<TheGraphClient> {
  const { subgraphs, log } = components
  const logger = log.getLogger('the-graph-client')

  async function runQuery<QueryResult, ReturnType>(
    query: Query<QueryResult, ReturnType>,
    variables: Record<string, any>
  ): Promise<ReturnType> {
    try {
      const response = await subgraphs[query.subgraph].query<QueryResult>(query.query, variables)
      return query.mapper(response)
    } catch (error) {
      logger.error(
        `Failed to execute the following query to the subgraph ${subgraphs[query.subgraph]} ${query.description}'.`,
        error
      )
      // TODO: Throw meaningful error
      throw new Error('Internal server error')
    }
  }

  function getNamesFragment([ethAddress, names]: [EthAddress, string[]]) {
    const nameList = names.map((name) => `"${name}"`).join(',')
    return `
      ${THE_GRAPH_PREFIX}${ethAddress}: nfts(where: { owner: "${ethAddress}", category: ens, name_in: [${nameList}] }, first: 1000) {
        name
      }
    `
  }

  async function checkForNamesOwnership(
    namesToCheck: [EthAddress, string[]][]
  ): Promise<{ owner: EthAddress; names: string[] }[]> {
    const subgraphQuery = `{` + namesToCheck.map((query) => getNamesFragment(query)).join('\n') + `}`
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
    return runQuery(query, {})
  }

  function getItemsFragment([ethAddress, itemIds]: [EthAddress, string[]], itemTypes: BlockchainItemType[]) {
    const urnList = itemIds.map((wearableId) => `"${wearableId}"`).join(',')
    return `
      ${THE_GRAPH_PREFIX}${ethAddress}: nfts(where: { owner: "${ethAddress}", searchItemType_in: ${JSON.stringify(
      itemTypes
    )}, urn_in: [${urnList}] }, first: 1000) {
        urn
      }
    `
  }

  function getOwnersByItem(
    itemIdsToCheck: [string, string[]][],
    subgraph: keyof SubGraphs,
    itemTypes: BlockchainItemType[]
  ): Promise<{ owner: EthAddress; urns: string[] }[]> {
    const subgraphQuery = `{` + itemIdsToCheck.map((query) => getItemsFragment(query, itemTypes)).join('\n') + `}`
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
    return runQuery(query, {})
  }

  async function getOwnedItems(
    itemIdsToCheck: [string, string[]][],
    subgraph: keyof SubGraphs,
    itemTypes: BlockchainItemType[]
  ): Promise<{ owner: EthAddress; urns: string[] }[]> {
    try {
      return getOwnersByItem(itemIdsToCheck, subgraph, itemTypes)
    } catch (error) {
      logger.error(error)
      return []
    }
  }

  function concatItems(
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
   * This method returns all the owners from the given wearables URNs. It looks for them first in Ethereum and then in Matic
   * @param itemIdsToCheck pairs of ethAddress and a list of urns to check ownership
   * @returns the pairs of ethAddress and list of urns
   */
  async function checkForItemsOwnership(
    itemIdsToCheck: [EthAddress, string[]][],
    itemTypes: BlockchainItemType[]
  ): Promise<{ owner: EthAddress; urns: string[] }[]> {
    const ethereumWearablesOwnersPromise = getOwnedItems(itemIdsToCheck, 'collectionsSubgraph', itemTypes)
    const maticWearablesOwnersPromise = getOwnedItems(itemIdsToCheck, 'maticCollectionsSubgraph', itemTypes)

    const [ethereumWearablesOwners, maticWearablesOwners] = await Promise.all([
      ethereumWearablesOwnersPromise,
      maticWearablesOwnersPromise
    ])

    return concatItems(ethereumWearablesOwners, maticWearablesOwners)
  }

  /**
   * This method returns all the owners from the given wearables URNs. It looks for them first in Ethereum and then in Matic
   * @param wearableIdsToCheck pairs of ethAddress and a list of urns to check ownership
   * @returns the pairs of ethAddress and list of urns
   */
  async function checkForWearablesOwnership(
    wearableIdsToCheck: [EthAddress, string[]][]
  ): Promise<{ owner: EthAddress; urns: string[] }[]> {
    return checkForItemsOwnership(wearableIdsToCheck, WEARABLE_TYPES)
  }

  async function checkForEmotesOwnership(
    emoteIdsToCheck: [EthAddress, string[]][]
  ): Promise<{ owner: EthAddress; urns: string[] }[]> {
    return checkForItemsOwnership(emoteIdsToCheck, EMOTE_TYPES)
  }

  async function getCollections(subgraph: keyof SubGraphs) {
    try {
      const query: Query<{ collections: { name: string; urn: string }[] }, { name: string; urn: string }[]> = {
        description: 'fetch collections',
        subgraph: subgraph,
        query: COLLECTIONS,
        mapper: (response) => response.collections
      }
      return runQuery(query, {})
    } catch {
      return []
    }
  }

  async function getAllCollections(): Promise<{ name: string; urn: string }[]> {
    const l1CollectionsPromise = getCollections('collectionsSubgraph')
    const l2CollectionsPromise = getCollections('maticCollectionsSubgraph')

    const [l1Collections, l2Collections] = await Promise.all([l1CollectionsPromise, l2CollectionsPromise])
    return l1Collections.concat(l2Collections)
  }

  /**
   * This method returns the list of third party integrations as well as collections
   */
  async function getThirdPartyIntegrations(): Promise<ThirdPartyIntegration[]> {
    const query: Query<
      { thirdParties: { id: string; metadata: { thirdParty: { name: string; description: string } } }[] },
      ThirdPartyIntegration[]
    > = {
      description: 'fetch third parties',
      subgraph: 'thirdPartyRegistrySubgraph',
      query: THIRD_PARTIES,
      mapper: (response) => response.thirdParties.map((tp) => ({ urn: tp.id, ...tp.metadata.thirdParty }))
    }
    return runQuery(query, { thirdPartyType: 'third_party_v1' })
  }

  /**
   * This method returns the third party resolver API to be used to query assets from any collection
   * of given third party integration
   */
  async function findThirdPartyResolver(subgraph: keyof SubGraphs, id: string): Promise<string | undefined> {
    const query: Query<{ thirdParties: [{ resolver: string }] }, string | undefined> = {
      description: 'fetch third party resolver',
      subgraph: subgraph,
      query: THIRD_PARTY_RESOLVER,
      mapper: (response) => response.thirdParties[0]?.resolver
    }
    return await runQuery(query, { id })
  }

  /** This method takes a query that could be paginated and performs the pagination internally */
  async function paginatableQuery<QueryResult, ReturnType extends Array<any>>(
    query: Query<QueryResult, ReturnType>,
    variables: Record<string, any>
  ): Promise<ReturnType> {
    let result: ReturnType | undefined = undefined
    let shouldContinue = true
    let start = ''
    while (shouldContinue) {
      const queried = await runQuery(query, { ...variables, first: MAX_PAGE_SIZE, start: start })
      if (!result) {
        result = queried
      } else {
        result.push(...queried)
      }
      start = queried[queried.length - 1]?.id
      shouldContinue = queried.length === MAX_PAGE_SIZE && !!start
    }
    return result!
  }

  async function getItemsByOwner(subgraph: keyof SubGraphs, owner: string, itemTypes: BlockchainItemType[]) {
    const query: Query<
      { nfts: { id: string; urn: string; collection: { isApproved: boolean } }[] },
      { id: string; urn: string; isApproved: boolean }[]
    > = {
      description: `fetch items (${itemTypes}) by owner`,
      subgraph: subgraph,
      query: ITEMS_BY_OWNER,
      mapper: (response) =>
        response.nfts.map(({ id, urn, collection }) => ({ id: id, urn: urn, isApproved: collection.isApproved }))
    }
    const items = await paginatableQuery(query, { owner: owner.toLowerCase(), item_types: itemTypes })
    return items.filter((item) => item.isApproved).map((item) => item.urn)
  }

  async function findItemsByOwner(
    owner: EthAddress,
    itemTypes: BlockchainItemType[]
  ): Promise<(WearableId | EmoteId)[]> {
    const ethereumWearablesPromise = getItemsByOwner('collectionsSubgraph', owner, itemTypes)
    const maticWearablesPromise = getItemsByOwner('maticCollectionsSubgraph', owner, itemTypes)
    const [ethereumWearables, maticWearables] = await Promise.all([ethereumWearablesPromise, maticWearablesPromise])

    return ethereumWearables.concat(maticWearables)
  }

  /**
   * Given an ethereum address, this method returns all wearables from ethereum and matic that are asociated to it.
   * @param owner
   */
  async function findWearableUrnsByOwner(owner: EthAddress): Promise<WearableId[]> {
    return findItemsByOwner(owner, WEARABLE_TYPES)
  }

  /**
   * Given an ethereum address, this method returns all wearables from ethereum and matic that are asociated to it.
   * @param owner
   */
  async function findEmoteUrnsByOwner(owner: EthAddress): Promise<EmoteId[]> {
    return findItemsByOwner(owner, EMOTE_TYPES)
  }

  async function getProtocol(urn: string) {
    const parsed = await parseUrn(urn)
    return parsed?.type === 'blockchain-collection-v1-asset' || parsed?.type === 'blockchain-collection-v2-asset'
      ? parsed.network
      : undefined
  }

  function buildItemUrnFilterQuery(
    filters: ItemFilters & { lastId?: string },
    itemTypes: BlockchainItemType[]
  ): string {
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

  function findItemUrnsByFiltersInSubgraph(
    subgraph: keyof SubGraphs,
    filters: ItemFilters & { lastId?: string },
    limit: number,
    itemTypes: BlockchainItemType[]
  ): Promise<(WearableId | EmoteId)[]> {
    const subgraphQuery = buildItemUrnFilterQuery(filters, itemTypes)
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

    return runQuery(query, { ...filters, lastId: filters.lastId ?? '', first: limit })
  }

  async function findWearableUrnsByFilters(
    filters: ItemFilters,
    pagination: { limit: number; lastId: string | undefined }
  ): Promise<WearableId[]> {
    // Order will be L1 > L2
    const L1_NETWORKS = ['mainnet', 'sepolia', 'ropsten', 'kovan', 'rinkeby', 'goerli']
    const L2_NETWORKS = ['matic', 'mumbai', 'amoy']
    const wearableTypes: BlockchainItemType[] = ['wearable_v1', 'wearable_v2', 'smart_wearable_v1', 'emote_v1']

    let limit = pagination.limit
    let lastId = pagination.lastId
    let lastIdLayer: string | undefined = lastId ? await getProtocol(lastId) : undefined

    const result: WearableId[] = []

    if (limit >= 0 && (!lastIdLayer || L1_NETWORKS.includes(lastIdLayer))) {
      const l1Result = await findItemUrnsByFiltersInSubgraph(
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
      const l2Result = await findItemUrnsByFiltersInSubgraph(
        'maticCollectionsSubgraph',
        { ...filters, lastId },
        limit + 1,
        wearableTypes
      )
      result.push(...l2Result)
    }

    return result
  }

  async function findEmoteUrnsByFilters(
    filters: ItemFilters,
    pagination: { limit: number; lastId: string | undefined }
  ): Promise<EmoteId[]> {
    // Order will be L1 > L2
    const L1_NETWORKS = ['mainnet', 'sepolia', 'kovan', 'rinkeby', 'goerli']
    const L2_NETWORKS = ['matic', 'mumbai', 'amoy']

    let limit = pagination.limit
    let lastId = pagination.lastId
    let lastIdLayer: string | undefined = lastId ? await getProtocol(lastId) : undefined

    const result: WearableId[] = []

    if (limit >= 0 && (!lastIdLayer || L1_NETWORKS.includes(lastIdLayer))) {
      const l1Result = await findItemUrnsByFiltersInSubgraph(
        'collectionsSubgraph',
        { ...filters, lastId },
        limit + 1,
        EMOTE_TYPES
      )
      result.push(...l1Result)
      limit -= l1Result.length
      lastId = undefined
      lastIdLayer = undefined
    }

    if (limit >= 0 && (!lastIdLayer || L2_NETWORKS.includes(lastIdLayer))) {
      const l2Result = await findItemUrnsByFiltersInSubgraph(
        'maticCollectionsSubgraph',
        { ...filters, lastId },
        limit + 1,
        EMOTE_TYPES
      )
      result.push(...l2Result)
    }

    return result
  }

  return {
    checkForNamesOwnership,
    checkForWearablesOwnership,
    checkForEmotesOwnership,
    getAllCollections,
    getThirdPartyIntegrations,
    findThirdPartyResolver,
    findWearableUrnsByOwner,
    findEmoteUrnsByOwner,
    findWearableUrnsByFilters,
    findEmoteUrnsByFilters
  }
}
