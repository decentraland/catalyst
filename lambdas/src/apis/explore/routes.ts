import { Request, Response, Router } from 'express'
import { DAOCache } from '../../service/dao/DAOCache'
import { SmartContentClient } from '../../utils/SmartContentClient'
import { hotScenes, realmsStatus } from './controllers/explore'

export function initializeExploreRoutes(router: Router, daoCache: DAOCache, contentClient: SmartContentClient): Router {
  router.get('/hot-scenes', createHotScenesHandler(daoCache, contentClient, hotScenes))
  router.get('/realms', createRealmsHandler(daoCache, realmsStatus))
  return router
}

function createHotScenesHandler(
  dao: DAOCache,
  contentClient: SmartContentClient,
  originalHandler: (daoCache: DAOCache, contentClient: SmartContentClient, req: Request, res: Response) => any
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(dao, contentClient, req, res)
}

function createRealmsHandler(
  dao: DAOCache,
  originalHandler: (daoCache: DAOCache, req: Request, res: Response) => any
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(dao, req, res)
}
