import { Request, Response } from 'express'
import { FILTRABLE_FIELDS } from '../services/wearable'
import { getDarList, getDarWearablesByAddress } from '../services/dar'
import { Wearable } from '../services/types'
import { readFile } from '../services/s3'
import { getWearable } from '../utils/wearable'
import { isValidCollectionId } from '../utils/collection'
import { pick, mapPick } from '../utils/fields'
import { intersect } from '../utils/array'
import { HTTPError, HTTP_STATUS_CODES } from '../utils/HTTPError'

// /addresses/:address/wearables
export async function getWearablesByAddress(req: Request, res: Response) {
  const address = req.params.address
  const fieldsQuery = req.query.fields || ''

  const dars = getDarList()
  const fields = intersect(fieldsQuery.split(','), FILTRABLE_FIELDS)

  const darWearables = await Promise.all(
    dars.map(dar => getDarWearablesByAddress(dar, address))
  )
  let wearables = darWearables.flat()
  wearables = mapPick<Wearable>(wearables, fields)

  res.json(wearables)
}

// /collection/:collectionId/wearables/:wearableId
export function getWearableById(req: Request, res: Response) {
  const collectionId = req.params.collectionId
  const wearableId = req.params.wearableId
  const fieldsQuery = req.query.fields || ''

  if (!isValidCollectionId(collectionId)) {
    throw new HTTPError('Invalid collection id', { collectionId })
  }

  const fields = intersect(fieldsQuery.split(','), FILTRABLE_FIELDS)
  let wearable = getWearable(collectionId, wearableId)

  if (!wearable) {
    throw new HTTPError(
      'Unknown wearable for collection',
      { collectionId, wearableId },
      HTTP_STATUS_CODES.notFound
    )
  }

  wearable = pick<Wearable>(wearable, fields)
  res.json(wearable)
}

// /collections/:collectionId/wearables/:wearableId/image
export async function getWearableImage(req: Request, res: Response) {
  const collectionId = req.params.collectionId
  const wearableId = req.params.wearableId

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

  if (!wearable.image) {
    throw new HTTPError(
      'Could not find a valid image for the requested wearable',
      { collectionId, wearableId },
      HTTP_STATUS_CODES.notFound
    )
  }

  let image
  try {
    image = await readFile(wearable.image)
  } catch (error) {
    throw new HTTPError('Error trying to get image from S3', {
      collectionId,
      wearableId,
      hash: wearable.image,
      error: error.message
    })
  }

  if (!image) {
    throw new HTTPError(
      'Could not find a valid image file for hash',
      { collectionId, wearableId, hash: wearable.image },
      HTTP_STATUS_CODES.notFound
    )
  }

  res.setHeader('Content-Type', image.ContentType!)
  return res.end(image.Body)
}
