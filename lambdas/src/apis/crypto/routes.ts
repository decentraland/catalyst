import { Request, Response, Router } from 'express'
import { HTTPProvider } from 'eth-connect'
import { validateSignature } from './controllers/crypto'

export function initializeCryptoRoutes(router: Router, ethereumProvider: HTTPProvider): Router {
  router.post('/validate-signature', createHandler(ethereumProvider, validateSignature))
  return router
}

function createHandler(
  ethereumProvider: HTTPProvider,
  originalHandler: (ethereumProvider: HTTPProvider, req: Request, res: Response) => void
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(ethereumProvider, req, res)
}
