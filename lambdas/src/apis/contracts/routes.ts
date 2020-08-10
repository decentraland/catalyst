import { Router, Request, Response } from 'express'
import { Environment } from '../../Environment'
import { getCatalystServersList, getPOIsList, getDenylistedNamesList } from './controllers/contracts'

export function initializeContractRoutes(router: Router, env: Environment): Router {
    router.get("/servers", createHandler(env, getCatalystServersList))
    router.get("/pois", createHandler(env, getPOIsList))
    router.get("/denylisted-names", createHandler(env, getDenylistedNamesList))
    return router
}

function createHandler(env: Environment, originalHandler: (env: Environment, req: Request, res: Response)=>void): (req: Request, res: Response)=>void {
    return (req: Request, res: Response) => originalHandler(env, req, res)
}
