import { Router, Request, Response } from 'express'
import { validateSignature } from './controllers/crypto'

export function initializeCryptoRoutes(router: Router, networkKey: string): Router {
    router.post("/validate-signature", createHandler(networkKey, validateSignature))
    return router
}

function createHandler(networkKey: string, originalHandler: (networkKey: string, req: Request, res: Response)=>void): (req: Request, res: Response)=>void {
    return (req: Request, res: Response) => originalHandler(networkKey, req, res)
}
