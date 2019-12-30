import url from 'url'
import { getCollection } from './collection'
import { Wearable, CollectionId } from '../services/types'

/**
 * Obtain a wearable from a particular collection
 * It'll use the JSONs stored on /data/collection/index.json
 */
export function getWearable(
  collectionId: string,
  wearableId: string
): Wearable | undefined {
  wearableId = getWearableURI(collectionId, wearableId)

  const collection = getCollection(collectionId as CollectionId)
  return collection
    ? collection.find(wearable => wearable.id === wearableId)
    : undefined
}

/**
 * It builds the wearable URI
 * It checks for the decentraland protocol (dcl://) on the wearableId so it's not duplicated
 */
export function getWearableURI(collectionId: string, wearableId: string) {
  return wearableId.startsWith('dcl://')
    ? wearableId
    : `dcl://${collectionId}/${wearableId}`
}

/**
 * Matches the different kinds of URIs a token can have, being:
 *   https://wearable-api.decentraland.org/v2/collections/exclusive_masks/wearables/asian_fox/1
 *   https://wearable-api.decentraland.org/v2/collections/exclusive_masks/wearables/asian_fox
 *   dcl://exclusive_masks/asian_fox/1
 *   dcl://exclusive_masks/asian_fox
 * and returns the wearable id, being `asian_fox` in this case
 */
export function getWearableIdFromURI(uri: string) {
  const { protocol } = url.parse(uri)
  let match: RegExpMatchArray | null = null

  // Keep in mind that the first match (if it exists) will be the entire secuence meaning
  // '/wearables/asian_fox' or '/wearables/asian_fox/1' on https:, 'dcl://exclusive_masks/asian_fox' on dcl:, etc
  // The second will be the first group we used ([^/]+) which corresponds to just 'asian_fox', that's why there's a match[1] on the return below
  switch (protocol) {
    case SUPPORTED_URI_PROTOCOLS.https:
      // https://wearable-api.decentraland.org/v2/collections/exclusive_masks/wearables/asian_fox/1
      match = uri.match('/wearables/([^/]+)(/\\d+)?$')
      break
    case SUPPORTED_URI_PROTOCOLS.dcl:
      // dcl://exclusive_masks/asian_fox/1
      match = uri.match('dcl://[^/]+/([^/]+)(/\\d+)?$')
      break
    default:
      break
  }

  return match ? match[1] : undefined
}

/**
 * Get the issued id from a token URI from different api versions:
 *   https://wearable-api.decentraland.org/v2/collections/exclusive_masks/wearables/asian_fox/1
 *   dcl://exclusive_masks/asian_fox/1
 * and returns the issued id, being `1` in this case. `null` if there is not issued id
 */
export function getIssuedIdFromURI(uri: string) {
  const issuedId = Number(uri.split('/').pop())

  if (isNaN(issuedId)) {
    return undefined
  }

  return issuedId
}

export const SUPPORTED_URI_PROTOCOLS = {
  https: 'https:',
  dcl: 'dcl:'
}
