import { Request, Response } from 'express'
import { env } from 'decentraland-commons'
import { STANDARDS } from '../services/standard'
import { getWearableSupplyByRarity } from '../services/rarity'
import { getWearable } from '../utils/wearable'
import { isValidCollectionId } from '../utils/collection'
import { HTTPError, HTTP_STATUS_CODES } from '../utils/HTTPError'

const API_VERSION = env.get('API_VERSION', 'v1')

// /standards/:standardId/collections/:collectionId/wearables/:wearableId/:issuedId?
export function getStandardWearableById(req: Request, res: Response) {
  const standardId = req.params.standardId
  const collectionId = req.params.collectionId
  const wearableId = req.params.wearableId
  const issuedId = req.params.issuedId

  if (!isValidCollectionId(collectionId)) {
    throw new HTTPError('Invalid collection id', { collectionId })
  }

  const wearable = getWearable(collectionId, wearableId)
  if (!wearable) {
    throw new HTTPError(
      'Unknown wearable for collection',
      { collectionId, wearableId },
      HTTP_STATUS_CODES.notFound
    )
  }

  const wearableMaxSupply = getWearableSupplyByRarity(wearable.rarity)
  if (!wearableMaxSupply) {
    throw new HTTPError(
      'Unknown wearable supply for wearable',
      { collectionId, wearableId },
      HTTP_STATUS_CODES.notFound
    )
  }

  switch (standardId) {
    case STANDARDS.ERC721Metadata:
      const serverURL = req.protocol + '://' + req.get('Host')
      const image = `${serverURL}/${API_VERSION}/collections/${collectionId}/wearables/${wearableId}/image`
      res.json({
        id: wearable.id,
        name: wearable.i18n[0].text,
        description: issuedId
          ? `DCL Wearable ${issuedId}/${wearableMaxSupply}`
          : '',
        image
      })
      break
    default:
      throw new HTTPError('Unknown standard', { standardId })
  }
}
