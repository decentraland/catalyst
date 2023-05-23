import { Router } from '@well-known-components/http-server'
import { multipartParserWrapper } from '@well-known-components/multipart-wrapper'
import { EnvironmentConfig } from '../Environment'
import { GlobalContext } from '../types'
import { getActiveEntitiesHandler } from './handlers/active-entities-handler'
import { createEntity } from './handlers/create-entity-handler'
import { errorHandler } from './handlers/error-handler'
import { getFailedDeploymentsHandler } from './handlers/failed-deployments-handler'
import { getEntitiesByPointerPrefixHandler } from './handlers/filter-by-urn-handler'
import { getEntityAuditInformationHandler } from './handlers/get-audit-handler'
import { getAvailableContentHandler } from './handlers/get-available-content-handler'
import { getPointerChangesHandler } from './handlers/pointer-changes-handler'
import { getStatusHandler } from './handlers/status-handler'
import { getSnapshotsHandler } from './handlers/get-snapshots-handler'
import { getEntitiesHandler } from './handlers/get-entities-handler'
import { getContentHandler } from './handlers/get-content-handler'
import { getEntityThumbnailHandler } from './handlers/get-entity-thumbnail-handler'
import { getEntityImageHandler } from './handlers/get-entity-image-handler'
import { getERC721EntityHandler } from './handlers/get-erc721-entity-handler'
import { getDeploymentsHandler } from './handlers/get-deployments-handler'
import { getChallengeHandler } from './handlers/get-challenge-handler'
import { getActiveEntityIdsByDeploymentHashHandler } from './handlers/get-active-entities-by-deployment-hash-handler'

// We return the entire router because it will be easier to test than a whole server
export async function setupRouter({ components }: GlobalContext): Promise<Router<GlobalContext>> {
  const router = new Router<GlobalContext>()
  router.use(errorHandler)

  const env = components.env
  const logger = components.logs.getLogger('router')

  if (env.getConfig(EnvironmentConfig.READ_ONLY)) {
    logger.info(`Content Server running on read-only mode. POST /entities endpoint will not be exposed`)
  } else {
    router.post('/entities', multipartParserWrapper(createEntity))
  }

  router.get('/entities/:type', getEntitiesHandler) // TODO: Deprecate
  router.get('/entities/active/collections/:collectionUrn', getEntitiesByPointerPrefixHandler)
  router.post('/entities/active', getActiveEntitiesHandler)
  router.head('/contents/:hashId', getContentHandler)
  router.get('/contents/:hashId', getContentHandler)
  router.get('/available-content', getAvailableContentHandler)
  router.get('/audit/:type/:entityId', getEntityAuditInformationHandler)
  router.get('/deployments', getDeploymentsHandler)
  router.get('/contents/:hashId/active-entities', getActiveEntityIdsByDeploymentHashHandler)
  router.get('/status', getStatusHandler)
  router.get('/failed-deployments', getFailedDeploymentsHandler)
  router.get('/challenge', getChallengeHandler)
  router.get('/pointer-changes', getPointerChangesHandler)
  router.get('/snapshots', getSnapshotsHandler)

  // queries: these endpoints are not part of the content replication protocol
  router.head('/queries/items/:pointer/thumbnail', getEntityThumbnailHandler)
  router.get('/queries/items/:pointer/thumbnail', getEntityThumbnailHandler)
  router.head('/queries/items/:pointer/image', getEntityImageHandler)
  router.get('/queries/items/:pointer/image', getEntityImageHandler)
  router.get('/queries/erc721/:chainId/:contract/:option/:emission?', getERC721EntityHandler)

  return router
}
