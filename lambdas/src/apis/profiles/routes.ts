import { NextFunction, Request, RequestHandler, Response, Router } from 'express'
import { SmartContentClient } from '../../utils/SmartContentClient'
import { TheGraphClient } from '../../utils/TheGraphClient'
import { getIndividualProfileById, getProfilesById } from './controllers/profiles'
import { EnsOwnership } from './EnsOwnership'
import { WearablesOwnership } from './WearablesOwnership'

function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch((e) => {
      console.error(`Unexpected error while performing request ${req.method} ${req.originalUrl}`, e)
      res.status(500).send({ status: 'server-error', message: 'Unexpected error' })
    })
  }
}

export function initializeIndividualProfileRoutes(
  router: Router,
  theGraphClient: TheGraphClient,
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearablesOwnership: WearablesOwnership,
  profilesCacheTTL: number
): Router {
  router.get(
    '/:id',
    createHandler(theGraphClient, client, ensOwnership, wearablesOwnership, profilesCacheTTL, getIndividualProfileById)
  )
  return router
}

export function initializeProfilesRoutes(
  router: Router,
  theGraphClient: TheGraphClient,
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearablesOwnership: WearablesOwnership,
  profilesCacheTTL: number
): Router {
  router.get(
    '/',
    createHandler(theGraphClient, client, ensOwnership, wearablesOwnership, profilesCacheTTL, getProfilesById)
  )
  router.get(
    '/:id',
    createHandler(theGraphClient, client, ensOwnership, wearablesOwnership, profilesCacheTTL, getIndividualProfileById)
  )
  return router
}

function createHandler(
  theGraphClient: TheGraphClient,
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearablesOwnership: WearablesOwnership,
  profilesCacheTTL: number,
  originalHandler: (
    theGraphClient: TheGraphClient,
    client: SmartContentClient,
    ensOwnership: EnsOwnership,
    wearablesOwnership: WearablesOwnership,
    profilesCacheTTL: number,
    req: Request,
    res: Response
  ) => Promise<any>
): RequestHandler {
  return asyncHandler(
    async (req, res) =>
      await originalHandler(theGraphClient, client, ensOwnership, wearablesOwnership, profilesCacheTTL, req, res)
  )
}
