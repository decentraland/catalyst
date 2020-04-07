import { Router, Request, Response } from 'express'
import { Environment } from '../../Environment'
import { validateSignature } from './controllers/crypto'

export function initializeCryptoRoutes(router: Router, env: Environment): Router {
    router.post("/validate-signature", createHandler(env, validateSignature))
    return router
}

function createHandler(env: Environment, originalHandler: (env: Environment, req: Request, res: Response)=>void): (req: Request, res: Response)=>void {
    return (req: Request, res: Response) => originalHandler(env, req, res)
}
