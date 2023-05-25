import { EthAddress } from '@dcl/crypto'
import { WearableId } from '@dcl/schemas'
import { ISubgraphComponent } from '@well-known-components/thegraph-component'
import { EmoteId, ItemFilters, ThirdPartyIntegration } from '../../apis/collections/types'

export type SubGraphs = {
  ensSubgraph: ISubgraphComponent
  collectionsSubgraph: ISubgraphComponent
  maticCollectionsSubgraph: ISubgraphComponent
  thirdPartyRegistrySubgraph: ISubgraphComponent
}

export type Query<QueryResult, ReturnType> = {
  description: string
  subgraph: keyof SubGraphs
  query: string
  mapper: (queryResult: QueryResult) => ReturnType
}

export type BlockchainItemType = 'wearable_v1' | 'wearable_v2' | 'smart_wearable_v1' | 'emote_v1'

export type TheGraphClient = {
  checkForNamesOwnership(namesToCheck: [EthAddress, string[]][]): Promise<{ owner: EthAddress; names: string[] }[]>
  checkForWearablesOwnership(
    wearableIdsToCheck: [EthAddress, string[]][]
  ): Promise<{ owner: EthAddress; urns: string[] }[]>
  checkForEmotesOwnership(emoteIdsToCheck: [EthAddress, string[]][]): Promise<{ owner: EthAddress; urns: string[] }[]>
  getAllCollections(): Promise<{ name: string; urn: string }[]>
  getThirdPartyIntegrations(): Promise<ThirdPartyIntegration[]>
  findThirdPartyResolver(subgraph: keyof SubGraphs, id: string): Promise<string | undefined>
  findWearableUrnsByOwner(owner: EthAddress): Promise<WearableId[]>
  findEmoteUrnsByOwner(owner: EthAddress): Promise<EmoteId[]>
  findWearableUrnsByFilters(
    filters: ItemFilters,
    pagination: { limit: number; lastId: string | undefined }
  ): Promise<WearableId[]>
  findEmoteUrnsByFilters(
    filters: ItemFilters,
    pagination: { limit: number; lastId: string | undefined }
  ): Promise<EmoteId[]>
}
