import { Request, Response, Router } from 'express'
import { SmartContentServerFetcher } from '../../utils/SmartContentServerFetcher'
import { getProfileById } from './controllers/profiles'
import { ENSFilter } from './ensFiltering'

export function initializeProfilesRoutes(
  router: Router,
  fetcher: SmartContentServerFetcher,
  filter: ENSFilter,
  ensOwnerProviderUrl: string
): Router {
  router.get('/:id', createHandler(fetcher, filter, ensOwnerProviderUrl, getProfileById))
  return router
}

function createHandler(
  fetcher: SmartContentServerFetcher,
  filter: ENSFilter,
  ensOwnerProviderUrl: string,
  originalHandler: (
    fetcher: SmartContentServerFetcher,
    filter: ENSFilter,
    ensOwnerProviderUrl: string,
    req: Request,
    res: Response
  ) => void
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(fetcher, filter, ensOwnerProviderUrl, req, res)
}
