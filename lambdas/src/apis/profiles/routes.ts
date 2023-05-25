import { NextFunction, Request, RequestHandler, Response, Router } from 'express'
import { TheGraphClient } from '../../ports/the-graph/types'
import { ThirdPartyAssetFetcher } from '../../ports/third-party/third-party-fetcher'
import { SmartContentClient } from '../../utils/SmartContentClient'
import { EmotesOwnership } from './EmotesOwnership'
import { EnsOwnership } from './EnsOwnership'
import { WearablesOwnership } from './WearablesOwnership'
import { getIndividualProfileById, getProfilesById, getProfilesByIdPost } from './controllers/profiles'

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
  emotesOwnership: EmotesOwnership,
  thirdPartyFetcher: ThirdPartyAssetFetcher,
  profilesCacheTTL: number
): Router {
  router.get(
    '/:id',
    createHandler(
      theGraphClient,
      client,
      ensOwnership,
      wearablesOwnership,
      emotesOwnership,
      thirdPartyFetcher,
      profilesCacheTTL,
      getIndividualProfileById
    )
  )
  return router
}

export function initializeProfilesRoutes(
  router: Router,
  theGraphClient: TheGraphClient,
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearablesOwnership: WearablesOwnership,
  emotesOwnership: EmotesOwnership,
  thirdPartyFetcher: ThirdPartyAssetFetcher,
  profilesCacheTTL: number
): Router {
  router.get(
    '/',
    createHandler(
      theGraphClient,
      client,
      ensOwnership,
      wearablesOwnership,
      emotesOwnership,
      thirdPartyFetcher,
      profilesCacheTTL,
      getProfilesById
    )
  )
  router.post(
    '/',
    createHandler(
      theGraphClient,
      client,
      ensOwnership,
      wearablesOwnership,
      emotesOwnership,
      thirdPartyFetcher,
      profilesCacheTTL,
      getProfilesByIdPost
    )
  )
  router.get(
    '/:id',
    createHandler(
      theGraphClient,
      client,
      ensOwnership,
      wearablesOwnership,
      emotesOwnership,
      thirdPartyFetcher,
      profilesCacheTTL,
      getIndividualProfileById
    )
  )
  return router
}

function createHandler(
  theGraphClient: TheGraphClient,
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearablesOwnership: WearablesOwnership,
  emotesOwnership: EmotesOwnership,
  thirdPartyFetcher: ThirdPartyAssetFetcher,
  profilesCacheTTL: number,
  originalHandler: (
    theGraphClient: TheGraphClient,
    client: SmartContentClient,
    ensOwnership: EnsOwnership,
    wearablesOwnership: WearablesOwnership,
    emotesOwnership: EmotesOwnership,
    thirdPartyFetcher: ThirdPartyAssetFetcher,
    profilesCacheTTL: number,
    req: Request,
    res: Response
  ) => Promise<any>
): RequestHandler {
  return asyncHandler(
    async (req, res) =>
      await originalHandler(
        theGraphClient,
        client,
        ensOwnership,
        wearablesOwnership,
        emotesOwnership,
        thirdPartyFetcher,
        profilesCacheTTL,
        req,
        res
      )
  )
}
