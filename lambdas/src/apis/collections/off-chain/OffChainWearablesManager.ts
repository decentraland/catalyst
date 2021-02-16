import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { EntityType } from 'dcl-catalyst-commons'
import { Wearable, WearableId, WearablesFilters } from '../types'
import { preferEnglish, translateEntityIntoWearable } from '../Utils'
import baseAvatars from './base-avatars'

export class OffChainWearablesManager {
  private definitions: { collectionId: OffChainCollectionId; wearable: Wearable }[]

  constructor(private readonly client: SmartContentClient) {}

  public async find(filters: WearablesFilters): Promise<Wearable[]> {
    // Load into memory all data regarding off-chain wearables
    await this.loadDefinitionsIfNecessary()

    // Note: So far, we have few off-chain wearables and no plans to add more. If we do add more in the future, then it
    // might make sense to modify this filter, since many optimizations could be added
    const filtered = this.definitions.filter(({ collectionId, wearable }) => {
      const okByCollection = !filters.collectionIds || filters.collectionIds.includes(collectionId)
      if (!okByCollection) return false

      const okByIds = !filters.wearableIds || filters.wearableIds.includes(wearable.id.toLowerCase())
      if (!okByIds) return false

      const text = preferEnglish(wearable.i18n)?.toLowerCase()
      const okByTextSearch = !filters.textSearch || !text || text.includes(filters.textSearch)
      return okByTextSearch
    })

    return filtered.map(({ wearable }) => wearable)
  }

  private async loadDefinitionsIfNecessary(): Promise<void> {
    if (this.definitions) {
      // Then we already loaded definitions
      return
    }

    this.definitions = []

    for (const [collectionId, wearableIds] of Object.entries(COLLECTIONS)) {
      const entities = await this.client.fetchEntitiesByPointers(EntityType.WEARABLE, wearableIds)
      entities
        .map((entity) => translateEntityIntoWearable(this.client, entity))
        .forEach((wearable) => this.definitions.push({ collectionId, wearable }))
    }
  }
}

const COLLECTIONS: OffChainCollections = {
  'base-avatars': baseAvatars
}

type OffChainCollections = { [collectionId: string]: WearableId[] }
type OffChainCollectionId = string
