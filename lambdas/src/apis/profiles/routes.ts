import { Request, Response, Router } from 'express'
import { SmartContentServerFetcher } from '../../utils/SmartContentServerFetcher'
import { getProfileById } from './controllers/profiles'
import { EnsOwnership } from './EnsOwnership'

export function initializeProfilesRoutes(
  router: Router,
  fetcher: SmartContentServerFetcher,
  ensOwnership: EnsOwnership
): Router {
  router.get('/:id', createHandler(fetcher, ensOwnership, getProfileById))
  return router
}

function createHandler(
  fetcher: SmartContentServerFetcher,
  ensOwnership: EnsOwnership,
  originalHandler: (fetcher: SmartContentServerFetcher, ensOwnership: EnsOwnership, req: Request, res: Response) => void
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(fetcher, ensOwnership, req, res)
}
