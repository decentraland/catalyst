import { Request, Response, Router } from 'express'
import { Environment } from '../Environment'
import { SmartContentServerFetcher } from '../utils/SmartContentServerFetcher'
import { getContents, getInfo, getScenes } from './handlers/content-v2/handlers'
import { healthHandler, statusHandler } from './handlers/status/handlers'

export function setupRouter(environment: Environment, fetcher: SmartContentServerFetcher): Router {
  const router = Router()

  // Base endpoints
  router.get('/status', (req: Request, res: Response) => statusHandler(res, environment))
  router.get('/health', (req: Request, res: Response) => healthHandler(res, environment))

  // Backwards compatibility for older Content API
  router.get('/contentV2/scenes', (req: Request, res: Response) => getScenes(fetcher, req, res))
  router.get('/contentV2/parcel_info', (req: Request, res: Response) => getInfo(fetcher, req, res))
  router.get('/contentV2/contents/:cid', (req: Request, res: Response) => getContents(fetcher, req, res))

  return router
}
