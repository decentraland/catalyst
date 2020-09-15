import { Router, Request, Response } from 'express'
import { getProfileById } from './controllers/profiles'
import { SmartContentServerFetcher } from '../../SmartContentServerFetcher'

export function initializeProfilesRoutes(router: Router, fetcher: SmartContentServerFetcher, ensOwnerProviderUrl: string): Router {
    router.get("/:id", createHandler(fetcher, ensOwnerProviderUrl, getProfileById))
    return router
}

function createHandler(fetcher: SmartContentServerFetcher, ensOwnerProviderUrl: string, originalHandler: (fetcher: SmartContentServerFetcher, ensOwnerProviderUrl: string, req: Request, res: Response)=>void): (req: Request, res: Response)=>void {
    return (req: Request, res: Response) => originalHandler(fetcher, ensOwnerProviderUrl, req, res)
}
