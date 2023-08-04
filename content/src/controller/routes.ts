import { Router } from '@well-known-components/http-server'
import { multipartParserWrapper } from '@well-known-components/multipart-wrapper'
import { EnvironmentConfig } from '../Environment.js.js'
import { GlobalContext } from '../types.js.js'
import { getActiveEntitiesHandler } from './handlers/active-entities-handler.js.js'
import { createEntity } from './handlers/create-entity-handler.js.js'
import { createErrorHandler, preventExecutionIfBoostrapping } from './middlewares.js.js'
import { getFailedDeploymentsHandler } from './handlers/failed-deployments-handler.js.js'
import { getEntitiesByPointerPrefixHandler } from './handlers/filter-by-urn-handler.js.js'
import { getEntityAuditInformationHandler } from './handlers/get-audit-handler.js.js'
import { getAvailableContentHandler } from './handlers/get-available-content-handler.js.js'
import { getPointerChangesHandler } from './handlers/pointer-changes-handler.js.js'
import { getStatusHandler } from './handlers/status-handler.js.js'
import { getSnapshotsHandler } from './handlers/get-snapshots-handler.js.js'
import { getEntitiesHandler } from './handlers/get-entities-handler.js.js'
import { getContentHandler } from './handlers/get-content-handler.js.js'
import { getEntityThumbnailHandler } from './handlers/get-entity-thumbnail-handler.js.js'
import { getEntityImageHandler } from './handlers/get-entity-image-handler.js.js'
import { getERC721EntityHandler } from './handlers/get-erc721-entity-handler.js.js'
import { getDeploymentsHandler } from './handlers/get-deployments-handler.js.js'
import { getChallengeHandler } from './handlers/get-challenge-handler.js.js'
import { getActiveEntityIdsByDeploymentHashHandler } from './handlers/get-active-entities-by-deployment-hash-handler.js.js'

// We return the entire router because it will be easier to test than a whole server
export async function setupRouter({ components }: GlobalContext): Promise<Router<GlobalContext>> {
  const router = new Router<GlobalContext>()
  router.use(createErrorHandler({ logs: components.logs }))

  const env = components.env
  const logger = components.logs.getLogger('router')

  if (env.getConfig(EnvironmentConfig.READ_ONLY)) {
    logger.info(`Content Server running on read-only mode. POST /entities endpoint will not be exposed`)
  } else {
    router.post(
      '/entities',
      preventExecutionIfBoostrapping({ synchronizationState: components.synchronizationState }),
      multipartParserWrapper(createEntity)
    )
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
