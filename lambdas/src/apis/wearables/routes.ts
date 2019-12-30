import { Router } from 'express'
import {
    getCollections,
    getCollectionWearablesById
} from './controllers/collection'
import {
    getWearablesByAddress,
    getWearableById,
    getWearableImage
} from './controllers/wearable'
import { getStandardWearableById } from './controllers/standard'
import { getHealthCheck } from './controllers/app'
import { asyncHandler } from './utils/asyncHandler'

export function initializeWearablesRoutes(router: Router): Router {
    router.get('/addresses/:address/wearables', asyncHandler(getWearablesByAddress))
    router.get('/collections', getCollections)
    router.get('/collections/:collectionId', getCollectionWearablesById)
    router.get('/collections/:collectionId/wearables', getCollectionWearablesById)
    router.get('/collections/:collectionId/wearables/:wearableId/image', asyncHandler(getWearableImage))
    router.get('/collections/:collectionId/wearables/:wearableId', getWearableById)
    router.get('/standards/:standardId/collections/:collectionId/wearables/:wearableId/:issuedId?', getStandardWearableById)
    router.get('/info', getHealthCheck)

    return router
}
