import { NextFunction, Request, RequestHandler, Response, Router } from 'express'
import { ThirdPartyAssetFetcher } from '../../ports/third-party/third-party-fetcher'
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
  profilesCacheTTL: number,
  thirdPartyFetcher: ThirdPartyAssetFetcher
): Router {
  router.get(
    '/:id',
    createHandler(theGraphClient, client, ensOwnership, wearablesOwnership, profilesCacheTTL, thirdPartyFetcher, getIndividualProfileById)
  )
  return router
}

export function initializeProfilesRoutes(
  router: Router,
  theGraphClient: TheGraphClient,
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearablesOwnership: WearablesOwnership,
  profilesCacheTTL: number,
  thirdPartyFetcher: ThirdPartyAssetFetcher,
): Router {
  router.get(
    '/',
    createHandler(theGraphClient, client, ensOwnership, wearablesOwnership, profilesCacheTTL, thirdPartyFetcher, getProfilesById)
  )
  router.get(
    '/:id',
    createHandler(theGraphClient, client, ensOwnership, wearablesOwnership, profilesCacheTTL, thirdPartyFetcher, getIndividualProfileById)
  )
  return router
}

function createHandler(
  theGraphClient: TheGraphClient,
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearablesOwnership: WearablesOwnership,
  profilesCacheTTL: number,
  thirdPartyFetcher: ThirdPartyAssetFetcher,
  originalHandler: (
    theGraphClient: TheGraphClient,
    client: SmartContentClient,
    ensOwnership: EnsOwnership,
    wearablesOwnership: WearablesOwnership,
    profilesCacheTTL: number,
    thirdPartyFetcher: ThirdPartyAssetFetcher,
    req: Request,
    res: Response
  ) => Promise<any>
): RequestHandler {
  return asyncHandler(
    async (req, res) =>
      await originalHandler(theGraphClient, client, ensOwnership, wearablesOwnership, profilesCacheTTL, thirdPartyFetcher, req, res)
  )
}
