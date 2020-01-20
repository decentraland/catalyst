import { Router, Request, Response } from 'express'
import { getProfileById } from './controllers/profiles'
import { Environment } from '../../Environment'

export function initializeProfilesRoutes(router: Router, env: Environment): Router {
    router.get("/:id", createHandler(env, getProfileById))
    return router
}


function createHandler(env: Environment, orignalHandler: (env: Environment, req: Request, res: Response)=>void): (req: Request, res: Response)=>void {
    return (req: Request, res: Response) => orignalHandler(env, req, res)
}
