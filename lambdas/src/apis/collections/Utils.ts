import { WearableId } from './controllers/collections'

/**
 * We are translating from the old id format into the new one.
 *
 * The old wearables format was like this: dcl://collectionName/wearableName
 * The new format is like this: collectionName-wearableName
 */
export function translateWearablesIdFormat(wearableId: WearableId): WearableId {
  return wearableId.replace('dcl://', '').replace('/', '-')
}

export function buildWearableId(contract: string, option: string): WearableId {
  return `${contract}-${option}`
}
