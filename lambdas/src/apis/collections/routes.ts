import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { TheGraphClient } from '@katalyst/lambdas/utils/TheGraphClient'
import { Request, Response, Router } from 'express'
import { contentsImage, contentsThumbnail, getStandardErc721 } from './controllers/collections'
import { getWearablesByOwnerEndpoint as getWearablesByOwnerHandler } from './controllers/wearables'

export function initializeCollectionsRoutes(
  router: Router,
  client: SmartContentClient,
  theGraphClient: TheGraphClient
): Router {
  router.get('/standard/erc721/:chainId/:contract/:option/:emission?', createHandler(client, getStandardErc721))
  router.get('/contents/:urn/image', createHandler(client, contentsImage))
  router.get('/contents/:urn/thumbnail', createHandler(client, contentsThumbnail))
  router.get('/wearables-by-owner/:owner', (req, res) => getWearablesByOwnerHandler(client, theGraphClient, req, res))
  return router
}

function createHandler(
  client: SmartContentClient,
  originalHandler: (client: SmartContentClient, req: Request, res: Response) => void
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(client, req, res)
}
