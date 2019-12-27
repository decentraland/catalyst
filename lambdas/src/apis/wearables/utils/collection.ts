import { CollectionId, Collection, Collections } from '../services/types'
import { collections } from '../data/collections'

/**
 * Get collection using the JSONs stored on /data/collection
 */
export function getCollection(
  collectionId: CollectionId
): Collection | undefined {
  return collections[collectionId]
}

export function getCollections(): Collections {
  return collections
}

export function isValidCollectionId(collectionId: string): boolean {
  return collectionId in collections
}
