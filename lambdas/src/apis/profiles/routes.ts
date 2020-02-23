import { Router, Request, Response } from 'express'
import { getProfileById } from './controllers/profiles'
import { Environment } from '../../Environment'
import { SmartContentServerFetcher } from 'lambdas/src/SmartContentServerFetcher'

export function initializeProfilesRoutes(router: Router, env: Environment, fetcher: SmartContentServerFetcher): Router {
    router.get("/:id", createHandler(env, fetcher, getProfileById))
    return router
}


function createHandler(env: Environment, fetcher: SmartContentServerFetcher, originalHandler: (env: Environment, fetcher: SmartContentServerFetcher, req: Request, res: Response)=>void): (req: Request, res: Response)=>void {
    return (req: Request, res: Response) => originalHandler(env, fetcher, req, res)
}
