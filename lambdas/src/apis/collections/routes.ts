import { Request, Response, Router } from 'express'
import { SmartContentClient } from '../../utils/SmartContentClient'
import { TheGraphClient } from '../../utils/TheGraphClient'
import { contentsImage, contentsThumbnail, getCollectionsHandler, getStandardErc721 } from './controllers/collections'
import {
  getWearablesByOwnerEndpoint as getWearablesByOwnerHandler,
  getWearablesEndpoint
} from './controllers/wearables'
import { OffChainWearablesManager } from './off-chain/OffChainWearablesManager'

export function initializeCollectionsRoutes(
  router: Router,
  client: SmartContentClient,
  theGraphClient: TheGraphClient,
  offChainManager: OffChainWearablesManager,
  rootStorageLocation: string
): Router {
  router.get('/standard/erc721/:chainId/:contract/:option/:emission?', createHandler(client, getStandardErc721))
  router.get('/contents/:urn/image', createHandler(client, contentsImage, rootStorageLocation))
  router.get('/contents/:urn/image/:size', createHandler(client, contentsImage, rootStorageLocation))
  router.get('/contents/:urn/thumbnail', createHandler(client, contentsThumbnail, rootStorageLocation))
  router.get('/contents/:urn/thumbnail/:size', createHandler(client, contentsThumbnail, rootStorageLocation))
  router.get('/', (req, res) => getCollectionsHandler(theGraphClient, req, res))
  router.get('/wearables-by-owner/:owner', (req, res) => getWearablesByOwnerHandler(client, theGraphClient, req, res))
  router.get('/wearables', (req, res) => getWearablesEndpoint(client, theGraphClient, offChainManager, req, res))
  return router
}

function createHandler(
  client: SmartContentClient,
  originalHandler: (client: SmartContentClient, req: Request, res: Response, storage?: string) => void,
  rootStorageLocation?: string
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(client, req, res, rootStorageLocation)
}
