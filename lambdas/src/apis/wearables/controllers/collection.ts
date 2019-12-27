import { Request, Response } from 'express'
import { FILTRABLE_FIELDS } from '../services/wearable'
import { FullCollection, CollectionId } from '../services/types'
import {
  getCollections as getAllCollections,
  getCollection,
  isValidCollectionId
} from '../utils/collection'
import { HTTPError, HTTP_STATUS_CODES } from '../utils/HTTPError'
import { pick } from '../utils/fields'
import { intersect } from '../utils/array'

// /collections
export function getCollections(req: Request, res: Response) {
  const fieldsQuery = req.query.fields || ''
  const fields = intersect(fieldsQuery.split(','), FILTRABLE_FIELDS)

  const allCollections = getAllCollections()
  const collections: FullCollection[] = []

  for (const id in allCollections) {
    const wearables = allCollections[id as CollectionId]
    const collection = pick<FullCollection>({ id, wearables }, fields)
    collections.push(collection)
  }

  res.json(collections)
}

// /collections/:collectionId
// /collections/:collectionId/wearables
export function getCollectionWearablesById(req: Request, res: Response) {
  const collectionId = req.params.collectionId

  if (!isValidCollectionId(collectionId)) {
    throw new HTTPError(
      'Invalid collection id',
      { collectionId },
      HTTP_STATUS_CODES.notFound
    )
  }

  const collection = getCollection(collectionId as CollectionId)
  res.json(collection)
}
