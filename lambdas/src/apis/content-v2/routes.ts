import { Request, Response, Router } from 'express'
import { SmartContentServerFetcher } from '../../utils/SmartContentServerFetcher'
import { getContents, getInfo, getScenes } from './controllers/translator'

export function initializeContentV2Routes(router: Router, fetcher: SmartContentServerFetcher): Router {
  router.get('/scenes', createHandler(fetcher, getScenes))
  router.get('/parcel_info', createHandler(fetcher, getInfo))
  router.get('/contents/:cid', createHandler(fetcher, getContents))
  return router
}

function createHandler(
  fetcher: SmartContentServerFetcher,
  originalHandler: (fetcher: SmartContentServerFetcher, req: Request, res: Response) => void
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(fetcher, req, res)
}
