import { Request, Response, Router } from 'express'
import { SmartContentServerFetcher } from '../../utils/SmartContentServerFetcher'
import { getProfileById } from './controllers/profiles'

export function initializeProfilesRoutes(
  router: Router,
  fetcher: SmartContentServerFetcher,
  ensOwnerProviderUrl: string
): Router {
  router.get('/:id', createHandler(fetcher, ensOwnerProviderUrl, getProfileById))
  return router
}

function createHandler(
  fetcher: SmartContentServerFetcher,
  ensOwnerProviderUrl: string,
  originalHandler: (
    fetcher: SmartContentServerFetcher,
    ensOwnerProviderUrl: string,
    req: Request,
    res: Response
  ) => void
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(fetcher, ensOwnerProviderUrl, req, res)
}
