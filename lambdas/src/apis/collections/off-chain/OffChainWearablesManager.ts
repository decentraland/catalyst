import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { EntityType } from 'dcl-catalyst-commons'
import future, { IFuture } from 'fp-future'
import { Wearable, WearableId, WearablesFilters } from '../types'
import { preferEnglish, translateEntityIntoWearable } from '../Utils'
import baseAvatars from './base-avatars'

/**
 * This manager will handle all off-chain wearables. If you need to add a new off-chain collection,
 * then look at 'baseAvatars' at the end of the file.
 */
export class OffChainWearablesManager {
  private definitions: IFuture<LocalOffChainWearables>

  constructor(
    private readonly client: SmartContentClient,
    private readonly collections: OffChainCollections = DEFAULT_COLLECTIONS
  ) {}

  public async find(filters: WearablesFilters, lastId?: string): Promise<Wearable[]> {
    // Load into memory all data regarding off-chain wearables
    const definitions = await this.loadDefinitionsIfNecessary()

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

  private async loadDefinitionsIfNecessary(): Promise<LocalOffChainWearables> {
    if (!this.definitions) {
      // We are using future here, so if get many requests at once, we only calculate the definitions once
      this.definitions = future()

      const localDefinitions: LocalOffChainWearables = []

      for (const [collectionId, wearableIds] of Object.entries(this.collections)) {
        const entities = await this.client.fetchEntitiesByPointers(EntityType.WEARABLE, wearableIds)
        entities
          .map((entity) => translateEntityIntoWearable(this.client, entity))
          .sort((wearable1, wearable2) => wearable1.id.toLowerCase().localeCompare(wearable2.id.toLowerCase()))
          .forEach((wearable) => localDefinitions.push({ collectionId, wearable }))
      }

      this.definitions.resolve(localDefinitions)
    }

    return this.definitions
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
