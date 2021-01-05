import { Request, Response, Router } from 'express'
import { Cache } from '../../utils/Cache'
import { SmartContentServerFetcher } from '../../utils/SmartContentServerFetcher'
import { getProfileById, ProfileMetadata } from './controllers/profiles'

export function initializeProfilesRoutes(
  router: Router,
  cache: Cache<string, ProfileMetadata>,
  fetcher: SmartContentServerFetcher,
  ensOwnerProviderUrl: string
): Router {
  router.get('/:id', createHandler(cache, fetcher, ensOwnerProviderUrl, getProfileById))
  return router
}

function createHandler(
  cache: Cache<string, ProfileMetadata>,
  fetcher: SmartContentServerFetcher,
  ensOwnerProviderUrl: string,
  originalHandler: (
    cache: Cache<string, ProfileMetadata>,
    fetcher: SmartContentServerFetcher,
    ensOwnerProviderUrl: string,
    req: Request,
    res: Response
  ) => void
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(cache, fetcher, ensOwnerProviderUrl, req, res)
}
