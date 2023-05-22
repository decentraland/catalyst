import { Router } from '@well-known-components/http-server'
import { multipartParserWrapper } from '@well-known-components/multipart-wrapper'
import { EnvironmentConfig } from '../Environment'
import { GlobalContext } from '../types'
import { getActiveEntities } from './handlers/active-entities-handler'
import {
  getActiveDeploymentsByContentHashHandler,
  getChallenge,
  getContent,
  getDeploymentsHandler,
  getEntityImage,
  getEntityThumbnail,
  getERC721Entity
} from './Controller'
import { createEntity } from './handlers/create-entity-handler'
import { errorHandler } from './handlers/error-handler'
import { getFailedDeployments } from './handlers/failed-deployments-handler'
import { getEntitiesByPointerPrefix } from './handlers/filter-by-urn-handler'
import { getEntityAuditInformation } from './handlers/get-audit-handler'
import { getAvailableContent } from './handlers/get-available-content-handler'
import { getPointerChangesHandler } from './handlers/pointer-changes-handler'
import { getStatus } from './handlers/status-handler'
import { getSnapshots } from './handlers/get-snapshots-handler'
import { getEntities } from './handlers/get-entities-handler'

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

  router.get('/entities/:type', getEntities) // TODO: Deprecate
  router.get('/entities/active/collections/:collectionUrn', getEntitiesByPointerPrefix)
  router.post('/entities/active', getActiveEntities)
  router.head('/contents/:hashId', getContent)
  router.get('/contents/:hashId', getContent)
  router.get('/available-content', getAvailableContent)
  router.get('/audit/:type/:entityId', getEntityAuditInformation)
  router.get('/deployments', getDeploymentsHandler)
  router.get('/contents/:hashId/active-entities', getActiveDeploymentsByContentHashHandler)
  router.get('/status', getStatus)
  router.get('/failed-deployments', getFailedDeployments)
  router.get('/challenge', getChallenge)
  router.get('/pointer-changes', getPointerChangesHandler)
  router.get('/snapshots', getSnapshots)

  // queries: these endpoints are not part of the content replication protocol
  router.head('/queries/items/:pointer/thumbnail', getEntityThumbnail)
  router.get('/queries/items/:pointer/thumbnail', getEntityThumbnail)
  router.head('/queries/items/:pointer/image', getEntityImage)
  router.get('/queries/items/:pointer/image', getEntityImage)
  router.get('/queries/erc721/:chainId/:contract/:option/:emission?', getERC721Entity)

  return router
}
