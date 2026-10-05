import { Router, createBodySizeLimitMiddleware } from '@dcl/http-server'
import { clientIpFromForwardedHeader } from '@dcl/rate-limiter-component'
import { createSchemaValidatorComponent } from '@dcl/schema-validator-component'
import { EnvironmentConfig } from '../Environment'
import { multipartParserWrapper } from './multipart'
import { GlobalContext } from '../types'
import { activeEntitiesBodySchema, getActiveEntitiesHandler } from './handlers/active-entities-handler'
import { createEntity } from './handlers/create-entity-handler'
import { createErrorHandler, preventExecutionIfBoostrapping } from './middlewares'
import { getFailedDeploymentsHandler } from './handlers/failed-deployments-handler'
import { getEntitiesByCollectionPointerPrefixHandler } from './handlers/filter-by-urn-handler'
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
  router.use(createErrorHandler({ logs: components.logs }))

  const env = components.env
  const logger = components.logs.getLogger('router')

  // Request-body validation via the shared @dcl/schema-validator-component (used as middleware).
  // `ensureJsonContentType: false` preserves the previous lenient behavior (validate the parsed
  // body regardless of the Content-Type header).
  const schemaValidator = createSchemaValidatorComponent<GlobalContext>({ ensureJsonContentType: false })

  if (env.getConfig(EnvironmentConfig.READ_ONLY)) {
    logger.info(`Content Server running on read-only mode. POST /entities endpoint will not be exposed`)
  } else {
    router.post(
      '/entities',
      // Both limiters must stay ahead of the multipart parser, which buffers the whole upload
      // into memory. They use separate `name`s so they count in independent buckets.
      components.rateLimiter.withRateLimitMiddleware({
        name: '/entities burst',
        max: env.getConfig<number>(EnvironmentConfig.POST_ENTITIES_RATE_LIMIT_MAX),
        windowSeconds: env.getConfig<number>(EnvironmentConfig.POST_ENTITIES_RATE_LIMIT_WINDOW_SECONDS)
      }),
      components.rateLimiter.withRateLimitMiddleware({
        name: '/entities daily-quota',
        max: env.getConfig<number>(EnvironmentConfig.POST_ENTITIES_DAILY_QUOTA_MAX),
        windowSeconds: 86400
      }),
      preventExecutionIfBoostrapping({ syncOrchestrator: components.syncOrchestrator }),
      multipartParserWrapper(createEntity, {
        maxFileSize: env.getConfig<number>(EnvironmentConfig.MAX_UPLOAD_FILE_SIZE),
        maxFiles: env.getConfig<number>(EnvironmentConfig.MAX_UPLOAD_FILE_COUNT),
        maxFields: env.getConfig<number>(EnvironmentConfig.MAX_UPLOAD_FIELD_COUNT),
        maxFieldSize: env.getConfig<number>(EnvironmentConfig.MAX_UPLOAD_FIELD_SIZE),
        maxTotalSize: env.getConfig<number>(EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE)
      })
    )
  }

  router.get('/entities/:type', getEntitiesHandler) // TODO: Deprecate
  router.get('/entities/active/collections/:collectionUrn', getEntitiesByCollectionPointerPrefixHandler)
  router.post(
    '/entities/active',
    // Cap the body before the schema validator or handler buffer it into memory: JSON parsing
    // happens before schema validation, so the schema's `maxItems` can't prevent an OOM on its own.
    createBodySizeLimitMiddleware(env.getConfig<number>(EnvironmentConfig.MAX_ACTIVE_ENTITIES_BODY_SIZE)),
    schemaValidator.withSchemaValidatorMiddleware(activeEntitiesBodySchema),
    getActiveEntitiesHandler
  )
  // Per-client budget on individual content-file downloads — see DEFAULT_CONTENT_GET_RATE_LIMIT_MAX
  // for why this exists (nginx's `$uri`-keyed `limit_req` can't bound a bootstrap client requesting a
  // different hash every time). Reads the same TRUSTED_CLIENT_IP_HEADER as the POST /entities limiter
  // above, so both agree on which client a request came from.
  const trustedClientIpHeader = env.getConfig<string | undefined>(EnvironmentConfig.TRUSTED_CLIENT_IP_HEADER)
  const contentGetRateLimitMiddleware = components.rateLimiter.withRateLimitMiddleware({
    name: 'GET /contents',
    max: env.getConfig<number>(EnvironmentConfig.CONTENT_GET_RATE_LIMIT_MAX),
    windowSeconds: env.getConfig<number>(EnvironmentConfig.CONTENT_GET_RATE_LIMIT_WINDOW_SECONDS),
    // Exempts known DAO sync peers (by real egress IP — see TRUSTED_SYNC_PEER_IPS) so a full
    // resync/bootstrap is never throttled. Mirrors exactly how the limiter itself would resolve the
    // caller's address, so a peer is exempted under the same identity it would otherwise be counted
    // under, never a different one.
    skip: (request) => {
      if (components.trustedSyncPeerIps.size === 0 || !trustedClientIpHeader) {
        return false
      }
      const ip = clientIpFromForwardedHeader(request.headers.get(trustedClientIpHeader), 1)
      return ip !== null && components.trustedSyncPeerIps.has(ip)
    }
  })
  router.head('/contents/:hashId', contentGetRateLimitMiddleware, getContentHandler)
  router.get('/contents/:hashId', contentGetRateLimitMiddleware, getContentHandler)
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
