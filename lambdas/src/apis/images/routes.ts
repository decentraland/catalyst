import { Request, Response, Router } from 'express'
import { SmartContentServerFetcher } from '../../utils/SmartContentServerFetcher'
import { getResizedImage } from './controllers/images'

export function initializeImagesRoutes(
  router: Router,
  fetcher: SmartContentServerFetcher,
  rootStorageLocation: string
): Router {
  router.get('/:cid/:size', createHandler(fetcher, rootStorageLocation, getResizedImage))
  return router
}

function createHandler(
  fetcher: SmartContentServerFetcher,
  rootStorageLocation: string,
  originalHandler: (
    fetcher: SmartContentServerFetcher,
    rootStorageLocation: string,
    req: Request,
    res: Response
  ) => void
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(fetcher, rootStorageLocation, req, res)
}
