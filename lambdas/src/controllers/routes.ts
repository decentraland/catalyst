import { Request, Response, Router } from 'express'
import { Environment } from '../Environment'
import { healthHandler, statusHandler } from './handlers/status/status-handler'

export function setupRouter(environment: Environment): Router {
  const router = Router()

  router.get('/status', (req: Request, res: Response) => statusHandler(res, environment))
  router.get('/health', (req: Request, res: Response) => healthHandler(res, environment))

  return router
}
