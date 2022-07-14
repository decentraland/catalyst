import { Request, Response, Router } from 'express'
import { EnsOwnership } from './handlers/profiles/EnsOwnership'
import { WearablesOwnership } from './handlers/profiles/WearablesOwnership'
import { Bean, Environment, EnvironmentConfig } from '../Environment'
import { SmartContentClient } from '../utils/SmartContentClient'
import { SmartContentServerFetcher } from '../utils/SmartContentServerFetcher'
import { TheGraphClient } from '../utils/TheGraphClient'
import { getIndividualProfileById, getProfilesById, createProfileHandler } from './handlers/profiles/handlers'
import { healthHandler, statusHandler } from './handlers/status/handlers'
import { validateSignature } from './handlers/crypto/handlers'
import { HTTPProvider } from 'eth-connect'
import { getResizedImage } from './handlers/images/handlers'
import { DAOCache } from '../service/dao/DAOCache'
import { getCatalystServersList, getPOIsList, getDenylistedNamesList } from './handlers/contracts/handlers'
import {
  getStandardErc721,
  contentsImage,
  contentsThumbnail,
  getCollectionsHandler
} from './handlers/collections/collections'
import { getWearablesEndpoint, getWearablesByOwnerEndpoint } from './handlers/collections/wearables'
import { OffChainWearablesManager } from './handlers/collections/off-chain/OffChainWearablesManager'
import { hotScenes, realmsStatus } from './handlers/explorer/handlers'
import { initCache, retrieveThirdPartyIntegrations } from './handlers/third-party/handlers'

export function setupRouter(env: Environment): Router {
  const router = Router()

  const ensOwnership: EnsOwnership = env.getBean(Bean.ENS_OWNERSHIP)
  const wearablesOwnership: WearablesOwnership = env.getBean(Bean.WEARABLES_OWNERSHIP)
  const fetcher: SmartContentServerFetcher = env.getBean(Bean.SMART_CONTENT_SERVER_FETCHER)
  const contentClient: SmartContentClient = env.getBean(Bean.SMART_CONTENT_SERVER_CLIENT)
  const theGraphClient: TheGraphClient = env.getBean(Bean.THE_GRAPH_CLIENT)
  const profilesCacheTTL: number = env.getConfig(EnvironmentConfig.PROFILES_CACHE_TTL)
  const ethProvider: HTTPProvider = env.getBean(Bean.ETHEREUM_PROVIDER)
  const rootStorageLocation: string = env.getConfig(EnvironmentConfig.LAMBDAS_STORAGE_LOCATION)
  const daoCache: DAOCache = env.getBean(Bean.DAO)
  const offChainManager: OffChainWearablesManager = env.getBean(Bean.OFF_CHAIN_MANAGER)

  // Base endpoints
  router.get('/status', (req: Request, res: Response) => statusHandler(res, env))
  router.get('/health', (req: Request, res: Response) => healthHandler(res, env))

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
  // TODO: Remove the route /profile/{id} once we are sure is not being used, as it has been migrated to /profiles/{id}
  router.get(
    '/profile/:id',
    createProfileHandler(
      theGraphClient,
      contentClient,
      ensOwnership,
      wearablesOwnership,
      profilesCacheTTL,
      getIndividualProfileById
    )
  )

  // DCL-Crypto API implementation
  router.post('/crypto/validate-signature', (req: Request, res: Response) => validateSignature(ethProvider, req, res))

  // Images API for resizing contents
  router.get('/images/:cid/:size', (req: Request, res: Response) =>
    getResizedImage(fetcher, rootStorageLocation, req, res)
  )

  // DAO cached access API
  router.get('/contracts/servers', (req: Request, res: Response) => getCatalystServersList(daoCache, req, res))
  router.get('/contracts/pois', (req: Request, res: Response) => getPOIsList(daoCache, req, res))
  router.get('/contracts/denylisted-names', (req: Request, res: Response) => getDenylistedNamesList(daoCache, req, res))

  // DAO Collections access API
  router.get('/collections/standard/erc721/:chainId/:contract/:option/:emission?', (req: Request, res: Response) =>
    getStandardErc721(contentClient, req, res)
  )
  router.get('/collections/contents/:urn/image', (req: Request, res: Response) =>
    contentsImage(contentClient, req, res)
  )
  router.get('/collections/contents/:urn/thumbnail', (req: Request, res: Response) =>
    contentsThumbnail(contentClient, req, res)
  )
  router.get('/collections/', (req, res) => getCollectionsHandler(theGraphClient, req, res))
  router.get('/collections/wearables-by-owner/:owner', (req, res) =>
    getWearablesByOwnerEndpoint(contentClient, theGraphClient, req, res)
  )
  router.get('/collections/wearables', (req, res) =>
    getWearablesEndpoint(contentClient, theGraphClient, offChainManager, req, res)
  )

  // Functionality for Explorer use case
  router.get('/explore/hot-scenes', (req: Request, res: Response) => hotScenes(daoCache, contentClient, req, res))
  router.get('/explore/realms', (req: Request, res: Response) => realmsStatus(daoCache, req, res))

  // Third-party
  initCache(theGraphClient)
  router.get('/third-party-integrations/', (_, res) => retrieveThirdPartyIntegrations(res))

  return router
}
