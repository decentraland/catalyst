import { WearableId } from './controllers/collections'

/**
 * We are translating from the old id format into the new one.
 *
 * The old wearables format was like this: 'dcl://collectionName/wearableName'
 * The new format is like this: 'urn:decentraland:ethereum:collections-v1:collectionName:wearableName'
 */
export function translateWearablesIdFormat(wearableId: WearableId): WearableId {
  if (!wearableId.startsWith('dcl://')) {
    return wearableId
  }
  const [, , collectionName, wearableName] = wearableId.split('/')
  return `urn:decentraland:ethereum:collections-v1:${collectionName}:${wearableName}`
}
