import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { Request, Response, Router } from 'express'
import { contentsImage, contentsThumbnail, getStandardErc721 } from './controllers/collections'

export function initializeCollectionsRoutes(router: Router, client: SmartContentClient): Router {
  router.get('/standard/erc721/:chainId/:contract/:option/:emission?', createHandler(client, getStandardErc721))
  router.get('/contents/:urn/image', createHandler(client, contentsImage))
  router.get('/contents/:urn/thumbnail', createHandler(client, contentsThumbnail))
  return router
}

function createHandler(
  client: SmartContentClient,
  originalHandler: (client: SmartContentClient, req: Request, res: Response) => void
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(client, req, res)
}
