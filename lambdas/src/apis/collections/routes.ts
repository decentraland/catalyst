import { Router, Request, Response } from 'express'
import { contentsImage, contentsThumbnail, getStandardErc721 } from './controllers/collections'
import { SmartContentServerFetcher } from '../../utils/SmartContentServerFetcher'

export function initializeCollectionsRoutes(router: Router, fetcher: SmartContentServerFetcher): Router {
  router.get('/standard/erc721/:contract/:option/:emission?', createHandler(fetcher, getStandardErc721))
  router.get('/contents/:contract/:option/image', createHandler(fetcher, contentsImage))
  router.get('/contents/:contract/:option/thumbnail', createHandler(fetcher, contentsThumbnail))
  return router
}

function createHandler(
  fetcher: SmartContentServerFetcher,
  originalHandler: (fetcher: SmartContentServerFetcher, req: Request, res: Response) => void
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(fetcher, req, res)
}
