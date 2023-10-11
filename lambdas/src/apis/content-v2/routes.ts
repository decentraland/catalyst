import { Request, Response, Router } from 'express'
import { SmartContentServerFetcher } from '../../utils/SmartContentServerFetcher'
import { getInfo } from './controllers/translator'

export function initializeContentV2Routes(router: Router, fetcher: SmartContentServerFetcher): Router {
  router.get('/parcel_info', createHandler(fetcher, getInfo))
  return router
}

function createHandler(
  fetcher: SmartContentServerFetcher,
  originalHandler: (fetcher: SmartContentServerFetcher, req: Request, res: Response) => void
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(fetcher, req, res)
}
