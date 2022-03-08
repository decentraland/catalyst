import { asyncHandler } from '@dcl/catalyst-node-commons'
import { Request, RequestHandler, Response, Router } from 'express'
import { SmartContentClient } from '../../utils/SmartContentClient'
import { getIndividualProfileById, getProfilesById } from './controllers/profiles'
import { EnsOwnership } from './EnsOwnership'
import { WearablesOwnership } from './WearablesOwnership'

export function initializeIndividualProfileRoutes(
  router: Router,
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearablesOwnership: WearablesOwnership,
  profilesCacheTTL: number
): Router {
  router.get(
    '/:id',
    createHandler(client, ensOwnership, wearablesOwnership, profilesCacheTTL, getIndividualProfileById)
  )
  return router
}

export function initializeProfilesRoutes(
  router: Router,
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearablesOwnership: WearablesOwnership,
  profilesCacheTTL: number
): Router {
  router.get('/', createHandler(client, ensOwnership, wearablesOwnership, profilesCacheTTL, getProfilesById))
  router.get(
    '/:id',
    createHandler(client, ensOwnership, wearablesOwnership, profilesCacheTTL, getIndividualProfileById)
  )
  return router
}

function createHandler(
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearablesOwnership: WearablesOwnership,
  profilesCacheTTL: number,
  originalHandler: (
    client: SmartContentClient,
    ensOwnership: EnsOwnership,
    wearablesOwnership: WearablesOwnership,
    profilesCacheTTL: number,
    req: Request,
    res: Response
  ) => Promise<any>
): RequestHandler {
  return asyncHandler(
    async (req, res) => await originalHandler(client, ensOwnership, wearablesOwnership, profilesCacheTTL, req, res)
  )
}
