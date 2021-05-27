import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { TimeRefreshedDataHolder } from '@katalyst/lambdas/utils/TimeRefreshedDataHolder'
import { EntityType } from 'dcl-catalyst-commons'
import { Wearable, WearableId, WearablesFilters } from '../types'
import { preferEnglish, translateEntityIntoWearable } from '../Utils'
import baseAvatars from './base-avatars'

/**
 * This manager will handle all off-chain wearables. If you need to add a new off-chain collection,
 * then look at 'baseAvatars' at the end of the file.
 */
export class OffChainWearablesManager {
  private readonly definitions: TimeRefreshedDataHolder<LocalOffChainWearables>

  constructor({
    client,
    collections,
    refreshTime
  }: {
    client: SmartContentClient
    collections?: OffChainCollections
    refreshTime?: string
  }) {
    this.definitions = new TimeRefreshedDataHolder(
      () => OffChainWearablesManager.fetchOffChain(client, collections ?? DEFAULT_COLLECTIONS),
      refreshTime ?? '1d'
    )
  }

  public async find(filters: WearablesFilters, lastId?: string): Promise<Wearable[]> {
    const definitions = await this.definitions.get()
    return definitions.filter(this.buildFilter(filters, lastId)).map(({ wearable }) => wearable)
  }

  /**
   * Note: So far, we have few off-chain wearables and no plans to add more. If we do add more in the future, then it
   * might make sense to modify this filter, since many optimizations could be added
   */
  private buildFilter(
    filters: WearablesFilters,
    lastId: string | undefined
  ): (wearable: LocalOffChainWearable) => boolean {
    return ({ collectionId, wearable }) => {
      const lowerCaseWearableId = wearable.id.toLowerCase()
      const okByLastId = !lastId || lowerCaseWearableId > lastId
      if (!okByLastId) return false

      const okByCollection = !filters.collectionIds || filters.collectionIds.includes(collectionId)
      if (!okByCollection) return false

      const okByIds = !filters.wearableIds || filters.wearableIds.includes(lowerCaseWearableId)
      if (!okByIds) return false

      const text = preferEnglish(wearable.i18n)?.toLowerCase()
      const okByTextSearch = !filters.textSearch || (!!text && text.includes(filters.textSearch))
      return okByTextSearch
    }
  }

  private static async fetchOffChain(
    client: SmartContentClient,
    collections: OffChainCollections
  ): Promise<LocalOffChainWearables> {
    const localDefinitions: LocalOffChainWearables = []

    for (const [collectionId, wearableIds] of Object.entries(collections)) {
      const entities = await client.fetchEntitiesByPointers(EntityType.WEARABLE, wearableIds)
      entities
        .map((entity) => translateEntityIntoWearable(client, entity))
        .sort((wearable1, wearable2) => wearable1.id.toLowerCase().localeCompare(wearable2.id.toLowerCase()))
        .forEach((wearable) => localDefinitions.push({ collectionId, wearable }))
    }

    return localDefinitions
  }
}

export const BASE_AVATARS_COLLECTION_ID = 'urn:decentraland:off-chain:base-avatars'

const DEFAULT_COLLECTIONS: OffChainCollections = {
  [BASE_AVATARS_COLLECTION_ID]: baseAvatars
}

type LocalOffChainWearables = LocalOffChainWearable[]
type LocalOffChainWearable = { collectionId: OffChainCollectionId; wearable: Wearable }
type OffChainCollections = { [collectionId: string]: WearableId[] }
type OffChainCollectionId = string
