import { HTTPProvider } from 'eth-connect'
import { Request, Response, Router } from 'express'
import {
  contentsImage,
  contentsThumbnail,
  getCollectionsHandler,
  getStandardErc721
} from '../apis/collections/controllers/collections'
import { getEmotesByOwnerHandler, getEmotesHandler } from '../apis/collections/controllers/emotes'
import { getWearablesByOwnerHandler, getWearablesHandler } from '../apis/collections/controllers/wearables'
import { OffChainWearablesManager } from '../apis/collections/off-chain/OffChainWearablesManager'
import { getContents, getInfo, getScenes } from '../apis/content-v2/controllers/translator'
import { Bean, Environment, EnvironmentConfig } from '../Environment'
import { createFetchComponent } from '../ports/fetcher'
import { createThirdPartyAssetFetcher, ThirdPartyAssetFetcher } from '../ports/third-party/third-party-fetcher'
import { DAOCache } from '../service/dao/DAOCache'
import { SmartContentClient } from '../utils/SmartContentClient'
import { SmartContentServerFetcher } from '../utils/SmartContentServerFetcher'
import { TheGraphClient } from '../utils/TheGraphClient'
import { getCatalystServersList, getDenylistedNamesList, getPOIsList } from './handlers/contracts/handlers'
import { validateSignature } from './handlers/crypto/handlers'
import { hotScenes, realmsStatus } from './handlers/explorer/handlers'
import { getResizedImage } from './handlers/images/handlers'
import { EmotesOwnership } from './handlers/profiles/EmotesOwnership'
import { EnsOwnership } from './handlers/profiles/EnsOwnership'
import { createProfileHandler, getIndividualProfileById, getProfilesById } from './handlers/profiles/handlers'
import { WearablesOwnership } from './handlers/profiles/WearablesOwnership'
import { healthHandler, statusHandler } from './handlers/status/handlers'
import { initCache, retrieveThirdPartyIntegrations } from './handlers/third-party/handlers'

export function setupRouter(env: Environment): Router {
  const router = Router()

  const ensOwnership: EnsOwnership = env.getBean(Bean.ENS_OWNERSHIP)
  const wearablesOwnership: WearablesOwnership = env.getBean(Bean.WEARABLES_OWNERSHIP)
  const emotesOwnership: EmotesOwnership = env.getBean(Bean.EMOTES_OWNERSHIP)
  const fetcher: SmartContentServerFetcher = env.getBean(Bean.SMART_CONTENT_SERVER_FETCHER)
  const contentClient: SmartContentClient = env.getBean(Bean.SMART_CONTENT_SERVER_CLIENT)
  const theGraphClient: TheGraphClient = env.getBean(Bean.THE_GRAPH_CLIENT)
  const profilesCacheTTL: number = env.getConfig(EnvironmentConfig.PROFILES_CACHE_TTL)
  const ethProvider: HTTPProvider = env.getBean(Bean.ETHEREUM_PROVIDER)
  const rootStorageLocation: string = env.getConfig(EnvironmentConfig.LAMBDAS_STORAGE_LOCATION)
  const daoCache: DAOCache = env.getBean(Bean.DAO)
  const offChainManager: OffChainWearablesManager = env.getBean(Bean.OFF_CHAIN_MANAGER)
  const thirdPartyFetcher: ThirdPartyAssetFetcher = createThirdPartyAssetFetcher(createFetchComponent())

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
      emotesOwnership,
      profilesCacheTTL,
      thirdPartyFetcher,
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
      emotesOwnership,
      profilesCacheTTL,
      thirdPartyFetcher,
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
      emotesOwnership,
      profilesCacheTTL,
      thirdPartyFetcher,
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
    getWearablesByOwnerHandler(contentClient, theGraphClient, thirdPartyFetcher, req, res)
  )
  router.get('/collections/wearables', (req, res) =>
    getWearablesHandler(contentClient, theGraphClient, offChainManager, req, res)
  )
  router.get('/collections/emotes-by-owner/:owner', (req, res) =>
    getEmotesByOwnerHandler(contentClient, theGraphClient, thirdPartyFetcher, req, res)
  )
  router.get('/collections/emotes', (req, res) => getEmotesHandler(contentClient, theGraphClient, req, res))

  // Functionality for Explorer use case
  router.get('/explore/hot-scenes', (req: Request, res: Response) => hotScenes(daoCache, contentClient, req, res))
  router.get('/explore/realms', (req: Request, res: Response) => realmsStatus(daoCache, req, res))

  // Third-party
  initCache(theGraphClient)
  router.get('/third-party-integrations/', (_, res) => retrieveThirdPartyIntegrations(res))

  return router
}
