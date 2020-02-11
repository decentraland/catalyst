import { Router, Request, Response } from 'express'
import { getScenes, getInfo, getContents } from './controllers/translator'
import { Environment } from '../../Environment'

export function initializeContentV2Routes(router: Router, env: Environment): Router {
	router.get("/scenes", createHandler(env, getScenes))
	router.get("/parcel_info", createHandler(env, getInfo))
	router.get("/contents/:cid", createHandler(env, getContents))
    return router
}

function createHandler(env: Environment, originalHandler: (env: Environment, req: Request, res: Response)=>void): (req: Request, res: Response)=>void {
    return (req: Request, res: Response) => originalHandler(env, req, res)
}