import { Request, Response, Router } from 'express'
import { ThirdPartyAssetFetcher } from '../../ports/third-party/third-party-fetcher'
import { SmartContentClient } from '../../utils/SmartContentClient'
import { TheGraphClient } from '../../utils/TheGraphClient'
import { contentsImage, contentsThumbnail, getCollectionsHandler, getStandardErc721 } from './controllers/collections'
import { getEmotesByOwnerHandler, getEmotesHandler } from './controllers/emotes'
import { getWearablesByOwnerHandler, getWearablesHandler } from './controllers/wearables'
import { OffChainWearablesManager } from './off-chain/OffChainWearablesManager'

export function initializeCollectionsRoutes(
  router: Router,
  client: SmartContentClient,
  theGraphClient: TheGraphClient,
  offChainManager: OffChainWearablesManager,
  thirdPartyFetcher: ThirdPartyAssetFetcher
): Router {
  router.get('/standard/erc721/:chainId/:contract/:option/:emission?', createHandler(client, getStandardErc721))
  router.get('/contents/:urn/image', createHandler(client, contentsImage))
  router.get('/contents/:urn/thumbnail', createHandler(client, contentsThumbnail))
  router.get('/', (req, res) => getCollectionsHandler(theGraphClient, req, res))
  router.get('/wearables-by-owner/:owner', (req, res) =>
    getWearablesByOwnerHandler(client, theGraphClient, thirdPartyFetcher, req, res)
  )
  router.get('/wearables', (req, res) => getWearablesHandler(client, theGraphClient, offChainManager, req, res))
  router.get('/emotes-by-owner/:owner', (req, res) =>
    getEmotesByOwnerHandler(client, theGraphClient, thirdPartyFetcher, req, res)
  )
  router.get('/emotes', (req, res) => getEmotesHandler(client, theGraphClient, req, res))
  return router
}

function createHandler(
  client: SmartContentClient,
  originalHandler: (client: SmartContentClient, req: Request, res: Response) => void
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(client, req, res)
}
