const darList = require('../data/dar.json')
import { getTokensForAddress, getTokenURI } from './ethereum'
import { Dar, Collection } from './types'
import {
  getWearable,
  getWearableIdFromURI,
  getIssuedIdFromURI
} from '../utils/wearable'
import { isValidCollectionId } from '../utils/collection'

export function getDarList(): Dar[] {
  return darList.map(asDar)
}

export function isSupportedDar(dar: Dar): boolean {
  return darList.some(_dar => dar.contract_uri === dar.contract_uri)
}

/**
 * Obtains all the wearables an address has for one of the supported dars (found on /data/dar.json)
 */
export async function getDarWearablesByAddress(
  dar: Dar,
  address: string
): Promise<Collection> {
  if (!isSupportedDar(dar)) {
    console.warn(`Skipping unkown dar '${dar.contract_uri}'`)
    return []
  }
  if (!isValidCollectionId(dar.common_name)) {
    // prettier-ignore
    console.warn(
      `Skipping unkown collection '${dar.common_name}' found on dar '${dar.contract_uri}'`
    )
    return []
  }

  const tokens = await getTokensForAddress(dar.contract_uri, address)
  const wearables: Collection = []

  for (const token of tokens) {
    const tokenURI = await getTokenURI(token)

    const wearableId = getWearableIdFromURI(tokenURI)
    if (!wearableId) {
      // prettier-ignore
      throw new Error(
        `Malformed token uri '${tokenURI}' for wearable '${token.id}' on '${dar.contract_uri}'. Wallet: ${address}`
      )
    }

    const wearable = getWearable(dar.common_name, wearableId)
    if (!wearable) {
      console.warn(
        `Skipping unkown wearable '${wearableId}' for '${dar.common_name}'`
      )
      continue
    }

    const issuedId = getIssuedIdFromURI(tokenURI)
    if (!issuedId) {
      console.warn(
        `Skipping wearable '${wearableId}' with token URI '${tokenURI}', it lacks issued id for '${dar.common_name}'`
      )
      continue
    }

    wearables.push({ ...wearable, issuedId })
  }

  return wearables
}

/**
 * Allows for a dar-like object to be treated as a Dar, by specifying it's specific properties
 * It enforces a contract_uri, used in the codebase
 */
function asDar(dar: any) {
  if (!dar.contract_uri) {
    // prettier-ignore
    throw new Error(`Tried to transform ${JSON.stringify(dar)} to a dar, but it's missing a contract_uri property`)
  }
  return {
    name: dar.name,
    common_name: dar.common_name,
    contract_uri: dar.contract_uri,
    schema_url: dar.schema_url,
    image_url: dar.image_url,
    _conversion: dar._conversion
  }
}
