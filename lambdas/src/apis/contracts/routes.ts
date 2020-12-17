import { Request, Response, Router } from 'express'
import { DAOCache } from '../../service/dao/DAOCache'
import { getCatalystServersList, getDenylistedNamesList, getPOIsList } from './controllers/contracts'

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
