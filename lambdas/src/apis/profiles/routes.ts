import { Request, Response, Router } from 'express'
import { SmartContentClient } from '../../utils/SmartContentClient'
import { getIndividualProfileById, getProfilesById } from './controllers/profiles'
import { EnsOwnership } from './EnsOwnership'
import { WearablesOwnership } from './WearablesOwnership'

export function initializeIndividualProfileRoutes(
  router: Router,
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearablesOwnership: WearablesOwnership
): Router {
  router.get('/:id', createHandler(client, ensOwnership, wearablesOwnership, getIndividualProfileById))
  return router
}

export function initializeProfilesRoutes(
  router: Router,
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearablesOwnership: WearablesOwnership
): Router {
  router.get('/', createHandler(client, ensOwnership, wearablesOwnership, getProfilesById))
  router.get('/:id', createHandler(client, ensOwnership, wearablesOwnership, getIndividualProfileById))
  return router
}

function createHandler(
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearablesOwnership: WearablesOwnership,
  originalHandler: (
    client: SmartContentClient,
    ensOwnership: EnsOwnership,
    wearablesOwnership: WearablesOwnership,
    req: Request,
    res: Response
  ) => void
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(client, ensOwnership, wearablesOwnership, req, res)
}
