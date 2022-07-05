import { Request, Response, Router } from 'express'
import { EnsOwnership } from './handlers/profiles/EnsOwnership'
import { WearablesOwnership } from './handlers/profiles/WearablesOwnership'
import { Bean, Environment, EnvironmentConfig } from '../Environment'
import { SmartContentClient } from '../utils/SmartContentClient'
import { SmartContentServerFetcher } from '../utils/SmartContentServerFetcher'
import { TheGraphClient } from '../utils/TheGraphClient'
import { getContents, getInfo, getScenes } from './handlers/content-v2/handlers'
import { getIndividualProfileById, getProfilesById, createProfileHandler } from './handlers/profiles/handlers'
import { healthHandler, statusHandler } from './handlers/status/handlers'

export function setupRouter(env: Environment): Router {
  const router = Router()

  const ensOwnership: EnsOwnership = env.getBean(Bean.ENS_OWNERSHIP)
  const wearablesOwnership: WearablesOwnership = env.getBean(Bean.WEARABLES_OWNERSHIP)
  const fetcher: SmartContentServerFetcher = env.getBean(Bean.SMART_CONTENT_SERVER_FETCHER)
  const contentClient: SmartContentClient = env.getBean(Bean.SMART_CONTENT_SERVER_CLIENT)
  const theGraphClient: TheGraphClient = env.getBean(Bean.THE_GRAPH_CLIENT)
  const profilesCacheTTL: number = env.getConfig(EnvironmentConfig.PROFILES_CACHE_TTL)

  // Base endpoints
  router.get('/status', (req: Request, res: Response) => statusHandler(res, env))
  router.get('/health', (req: Request, res: Response) => healthHandler(res, env))

  // Backwards compatibility for older Content API
  router.get('/contentV2/scenes', (req: Request, res: Response) => getScenes(fetcher, req, res))
  router.get('/contentV2/parcel_info', (req: Request, res: Response) => getInfo(fetcher, req, res))
  router.get('/contentV2/contents/:cid', (req: Request, res: Response) => getContents(fetcher, req, res))

  // Profiles endpoints
  router.get(
    '/profiles/',
    createProfileHandler(
      theGraphClient,
      contentClient,
      ensOwnership,
      wearablesOwnership,
      profilesCacheTTL,
      getProfilesById
    )
  )
  router.get(
    '/profiles/:id',
    createProfileHandler(
      theGraphClient,
      contentClient,
      ensOwnership,
      wearablesOwnership,
      profilesCacheTTL,
      getIndividualProfileById
    )
  )

  return router
}
