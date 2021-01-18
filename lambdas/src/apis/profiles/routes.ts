import { Request, Response, Router } from 'express'
import { SmartContentClient } from '../../utils/SmartContentClient'
import { getIndividualProfileById, getProfilesById } from './controllers/profiles'
import { EnsOwnership } from './EnsOwnership'

export function initializeIndividualProfileRoutes(
  router: Router,
  client: SmartContentClient,
  ensOwnership: EnsOwnership
): Router {
  router.get('/:id', createHandler(client, ensOwnership, getIndividualProfileById))
  return router
}

export function initializeProfilesRoutes(
  router: Router,
  client: SmartContentClient,
  ensOwnership: EnsOwnership
): Router {
  router.get('/', createHandler(client, ensOwnership, getProfilesById))
  router.get('/:id', createHandler(client, ensOwnership, getIndividualProfileById))
  return router
}

function createHandler(
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  originalHandler: (client: SmartContentClient, ensOwnership: EnsOwnership, req: Request, res: Response) => void
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(client, ensOwnership, req, res)
}
