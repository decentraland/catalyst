import { Request, Response, Router } from 'express'
import { SmartContentClient } from '../../utils/SmartContentClient'
import { getProfileById, getProfilesById } from './controllers/profiles'
import { EnsOwnership } from './EnsOwnership'

export function initializeProfilesRoutes(
  router: Router,
  client: SmartContentClient,
  ensOwnership: EnsOwnership
): Router {
  router.get('/:id', createHandler(client, ensOwnership, getProfileById))
  return router
}

export function initializeMultipleProfilesRoutes(
  router: Router,
  client: SmartContentClient,
  ensOwnership: EnsOwnership
): Router {
  router.get('/', createHandler(client, ensOwnership, getProfilesById))
  return router
}

function createHandler(
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  originalHandler: (client: SmartContentClient, ensOwnership: EnsOwnership, req: Request, res: Response) => void
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(client, ensOwnership, req, res)
}
