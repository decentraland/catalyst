import { Router, Request, Response } from 'express'
import { getCatalystServersList, getPOIsList, getDenylistedNamesList } from './controllers/contracts'
import { DAOCache } from '../../service/dao/DAOCache'

export function initializeContractRoutes(router: Router, dao: DAOCache): Router {
  router.get('/servers', createHandler(dao, getCatalystServersList))
  router.get('/pois', createHandler(dao, getPOIsList))
  router.get('/denylisted-names', createHandler(dao, getDenylistedNamesList))
  return router
}

function createHandler(
  dao: DAOCache,
  originalHandler: (dao: DAOCache, req: Request, res: Response) => void
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(dao, req, res)
}
