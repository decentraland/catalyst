import { GetEntityInformation200 } from '@dcl/catalyst-api-specs/lib/client/client.schemas'
import { ContentItem } from '@dcl/catalyst-storage'
import { AuthChain, Authenticator, AuthLink, EthAddress, Signature } from '@dcl/crypto'
import { Entity, EntityType } from '@dcl/schemas'
import { Field } from '@well-known-components/multipart-wrapper'
import { asEnumValue, fromCamelCaseToSnakeCase } from './utils'
import {
  AuditInfo,
  Deployment,
  DeploymentContext,
  DeploymentOptions,
  isInvalidDeployment,
  isSuccessfulDeployment,
  SortingField,
  SortingOrder
} from '../deployment-types'
import {
  CURRENT_CATALYST_VERSION,
  CURRENT_COMMIT_HASH,
  CURRENT_CONTENT_VERSION,
  EnvironmentConfig
} from '../Environment'
import { getActiveDeploymentsByContentHash } from '../logic/database-queries/deployments-queries'
import { getDeployments } from '../logic/deployments'
import { findEntityByPointer, findImageHash, findThumbnailHash } from '../logic/entities'
import { buildUrn, formatERC21Entity, getProtocol } from '../logic/erc721'
import { qsGetArray, qsGetBoolean, qsGetNumber, qsParser, toQueryParams } from '../logic/query-params'
import { statusResponseFromComponents } from '../logic/status-checks'
import {
  FormHandlerContextWithPath,
  HandlerContextWithPath,
  InvalidRequestError,
  NotFoundError,
  parseEntityType
} from '../types'
import { ControllerDeploymentFactory } from './ControllerDeploymentFactory'
import { ControllerEntityFactory } from './ControllerEntityFactory'

/**
 * @deprecated
 * this endpoint will be deprecated in favor of `getActiveEntities`
 */
// Method: GET
// Query String: ?{filter}&fields={fieldList}
export async function getEntities(context: HandlerContextWithPath<'activeEntities' | 'database', '/entities/:type'>) {
  const { database, activeEntities } = context.components
  const type: EntityType = parseEntityType(context.params.type)
  const queryParams = qsParser(context.url.searchParams)

  const pointers: string[] = qsGetArray(queryParams, 'pointer').map((pointer) => pointer.toLocaleLowerCase())
  const ids: string[] = qsGetArray(queryParams, 'id')
  const fields: string = queryParams.fields as string

  // Validate type is valid
  if (!type) {
    return {
      status: 400,
      body: { error: `Unrecognized type: ${context.params.type}` }
    }
  }

  // Validate pointers or ids are present, but not both
  if ((ids.length > 0 && pointers.length > 0) || (ids.length == 0 && pointers.length == 0)) {
    return {
      status: 400,
      body: { error: 'ids or pointers must be present, but not both' }
    }
  }

  // Validate fields are correct or empty
  let enumFields: EntityField[] | undefined = undefined
  if (fields) {
    enumFields = fields.split(',').map((f) => (<any>EntityField)[f.toUpperCase().trim()])
  }

  // Calculate and mask entities
  const entities: Entity[] = !!ids.length
    ? await activeEntities.withIds(database, ids)
    : await activeEntities.withPointers(database, pointers)

  const maskedEntities: Entity[] = entities.map((entity) => ControllerEntityFactory.maskEntity(entity, enumFields))
  return {
    status: 200,
    body: maskedEntities
  }
}

// Method: GET or HEAD
export async function getEntityThumbnail(
  context: HandlerContextWithPath<
    'database' | 'activeEntities' | 'storage',
    '/entities/active/entity/:pointer/thumbnail'
  >
) {
  const { activeEntities, database } = context.components
  const pointer: string = context.params.pointer
  const entity = await findEntityByPointer(database, activeEntities, pointer)
  if (!entity) {
    throw new NotFoundError('Entity not found.')
  }

  const hash = findThumbnailHash(entity)
  if (!hash) {
    throw new NotFoundError('Entity has no thumbnail.')
  }

  const content: ContentItem | undefined = await context.components.storage.retrieve(hash)
  if (!content) {
    throw new NotFoundError('Entity has no thumbnail.')
  }

  return {
    status: 200,
    headers: getContentFileHeaders(content, hash),
    body: context.request.method.toUpperCase() === 'GET' ? await content.asRawStream() : undefined
  }
}

// Method: GET or HEAD
export async function getEntityImage(
  context: HandlerContextWithPath<'activeEntities' | 'database' | 'storage', '/entities/active/entity/:pointer/image'>
) {
  const { activeEntities, database } = context.components
  const pointer: string = context.params.pointer
  const entity = await findEntityByPointer(database, activeEntities, pointer)
  if (!entity) {
    throw new NotFoundError('Entity not found.')
  }

  const hash = findImageHash(entity)
  if (!hash) {
    throw new NotFoundError('Entity has no image.')
  }

  const content: ContentItem | undefined = await context.components.storage.retrieve(hash)
  if (!content) {
    throw new NotFoundError('Entity has no image.')
  }

  return {
    status: 200,
    headers: getContentFileHeaders(content, hash),
    body: context.request.method.toUpperCase() === 'GET' ? await content.asRawStream() : undefined
  }
}

// Method: GET
export async function getERC721Entity(
  context: HandlerContextWithPath<
    'env' | 'activeEntities' | 'database',
    '/entities/active/erc721/:chainId/:contract/:option/:emission?'
  >
) {
  const { database, activeEntities, env } = context.components
  const { chainId, contract, option, emission } = context.params

  const protocol = getProtocol(parseInt(chainId, 10))

  if (!protocol) {
    return {
      status: 400,
      body: `Invalid chainId '${chainId}'`
    }
  }

  const pointer = buildUrn(protocol, contract, option)
  const entity = await findEntityByPointer(database, activeEntities, pointer)
  if (!entity || !entity.metadata) {
    return {
      status: 404
    }
  }

  if (!entity.metadata.rarity) {
    throw new Error('Wearable is not standard.')
  }

  return {
    status: 200,
    body: formatERC21Entity(env, pointer, entity, emission)
  }
}

function requireString(val: string): string {
  if (typeof val !== 'string') throw new Error('A string was expected')
  return val
}

function extractAuthChain(fields: Record<string, Field>): AuthLink[] | undefined {
  if (fields[`authChain`]) {
    return JSON.parse(fields[`authChain`].value)
  }

  const ret: AuthChain = []

  let biggestIndex = -1

  // find the biggest index
  for (const i in fields) {
    const regexResult = /authChain\[(\d+)\]/.exec(i)
    if (regexResult) {
      biggestIndex = Math.max(biggestIndex, +regexResult[1])
    }
  }

  if (biggestIndex === -1) {
    return undefined
  }

  // fill all the authchain
  for (let i = 0; i <= biggestIndex; i++) {
    ret.push({
      payload: requireString(fields[`authChain[${i}][payload]`].value),
      signature: requireString(fields[`authChain[${i}][signature]`].value),
      type: requireString(fields[`authChain[${i}][type]`].value) as any
    })
  }

  return ret
}

// Method: POST
export async function createEntity(
  context: FormHandlerContextWithPath<'logs' | 'fs' | 'metrics' | 'deployer', '/entities'>
) {
  const { metrics, deployer, logs } = context.components

  const logger = logs.getLogger('create-entity')
  const entityId: string = context.formData.fields.entityId.value

  let authChain = extractAuthChain(context.formData.fields)
  const ethAddress: EthAddress = authChain ? authChain[0].payload : ''
  const signature: Signature = context.formData.fields.signature?.value

  if (authChain) {
    if (!AuthChain.validate(authChain)) {
      return {
        status: 400,
        body: 'Invalid auth chain'
      }
    }
  } else if (ethAddress && signature) {
    authChain = Authenticator.createSimpleAuthChain(entityId, ethAddress, signature)
  } else {
    return {
      status: 400,
      body: 'No auth chain can be derivated'
    }
  }

  const deployFiles: ContentFile[] = []
  try {
    for (const filename of Object.keys(context.formData.files)) {
      const file = context.formData.files[filename]
      deployFiles.push({ path: filename, content: file.value })
    }

    const auditInfo = { authChain, version: CURRENT_CONTENT_VERSION }

    const deploymentResult = await deployer.deployEntity(
      deployFiles.map(({ content }) => content),
      entityId,
      auditInfo,
      DeploymentContext.LOCAL
    )

    if (isSuccessfulDeployment(deploymentResult)) {
      metrics.increment('dcl_deployments_endpoint_counter', { kind: 'success' })
      return {
        status: 200,
        body: { creationTimestamp: deploymentResult }
      }
    } else if (isInvalidDeployment(deploymentResult)) {
      metrics.increment('dcl_deployments_endpoint_counter', { kind: 'validation_error' })
      logger.error(`POST /entities - Deployment failed (${deploymentResult.errors.join(',')})`)
      return {
        status: 400,
        body: { errors: deploymentResult.errors }
      }
    } else {
      logger.error(`deploymentResult is invalid ${JSON.stringify(deploymentResult)}`)
      throw new Error('deploymentResult is invalid')
    }
  } catch (error) {
    metrics.increment('dcl_deployments_endpoint_counter', { kind: 'error' })
    logger.error(`POST /entities - Internal server error '${error}'`, {
      entityId,
      authChain: JSON.stringify(authChain),
      ethAddress,
      signature
    })
    logger.error(error)
    throw error
  }
}

// Method: GET or HEAD
export async function getContent(context: HandlerContextWithPath<'storage', '/contents/:hashId'>) {
  const hash = context.params.hashId

  const content: ContentItem | undefined = await context.components.storage.retrieve(hash)
  if (!content) {
    return {
      status: 404
    }
  }

  return {
    status: 200,
    headers: getContentFileHeaders(content, hash),
    body: context.request.method.toUpperCase() === 'GET' ? await content.asRawStream() : undefined
  }
}

// Method: GET
// Query String: ?cid={hashId1}&cid={hashId2}
export async function getAvailableContent(
  context: HandlerContextWithPath<'denylist' | 'storage', '/available-content'>
) {
  const { storage, denylist } = context.components
  const queryParams = qsParser(context.url.searchParams)
  const cids: string[] = qsGetArray(queryParams, 'cid')

  if (cids.length === 0) {
    return {
      status: 400,
      body: 'Please set at least one cid.'
    }
  }
  const availableCids = cids.filter((cid) => !denylist.isDenylisted(cid))
  const availableContent = await storage.existMultiple(availableCids)

  return {
    status: 200,
    body: Array.from(availableContent.entries()).map(([fileHash, isAvailable]) => ({
      cid: fileHash,
      available: isAvailable
    }))
  }
}

// Method: GET
export async function getAudit(
  context: HandlerContextWithPath<'database' | 'denylist' | 'metrics', '/audit/:type/:entityId'>
): Promise<{ status: 200; body: GetEntityInformation200 }> {
  const type = parseEntityType(context.params.type)
  const entityId = context.params.entityId

  // Validate type is valid
  if (!type) {
    throw new InvalidRequestError(`Unrecognized type: ${context.params.type}`)
  }

  const { deployments } = await getDeployments(context.components, context.components.database, {
    fields: [DeploymentField.AUDIT_INFO],
    filters: { entityIds: [entityId], entityTypes: [type] },
    includeDenylisted: true
  })

  if (deployments.length === 0) {
    throw new NotFoundError('No deployment found')
  }

  const { auditInfo } = deployments[0]
  const body: AuditInfo = {
    version: auditInfo.version,
    localTimestamp: auditInfo.localTimestamp,
    authChain: auditInfo.authChain,
    overwrittenBy: auditInfo.overwrittenBy,
    isDenylisted: auditInfo.isDenylisted,
    denylistedContent: auditInfo.denylistedContent
  }
  return {
    status: 200,
    body
  }
}

// Method: GET
export async function getActiveDeploymentsByContentHashHandler(
  context: HandlerContextWithPath<'database' | 'denylist', '/contents/:hashId/active-entities'>
) {
  const hashId = context.params.hashId

  let result = await getActiveDeploymentsByContentHash(context.components, hashId)
  result = result.filter((entityId) => !context.components.denylist.isDenylisted(entityId))

  if (result.length === 0) {
    throw new NotFoundError('The entity was not found')
  }

  return {
    status: 200,
    body: result
  }
}

// Method: GET
// Query String: ?from={timestamp}&toLocalTimestamp={timestamp}&entityType={entityType}&entityId={entityId}&onlyCurrentlyPointed={boolean}
export async function getDeploymentsHandler(
  context: HandlerContextWithPath<'database' | 'denylist' | 'metrics' | 'sequentialExecutor', '/deployments'>
) {
  const queryParams = qsParser(context.url.searchParams)
  const entityTypes: (EntityType | undefined)[] = qsGetArray(queryParams, 'entityType').map((type) =>
    parseEntityType(type)
  )
  const entityIds = qsGetArray(queryParams, 'entityId')
  const onlyCurrentlyPointed: boolean | undefined = qsGetBoolean(queryParams, 'onlyCurrentlyPointed')
  const pointers = qsGetArray(queryParams, 'pointer').map((pointer) => pointer.toLowerCase())
  const offset: number | undefined = qsGetNumber(queryParams, 'offset')
  const limit: number | undefined = qsGetNumber(queryParams, 'limit')
  const fields: string | null = queryParams.fields as string
  const sortingFieldParam: string | null = queryParams.sortingField as string
  const snake_case_sortingField = sortingFieldParam ? fromCamelCaseToSnakeCase(sortingFieldParam) : undefined
  const sortingField: SortingField | undefined | 'unknown' = asEnumValue(SortingField, snake_case_sortingField)
  const sortingOrder: SortingOrder | undefined | 'unknown' = asEnumValue(
    SortingOrder,
    (queryParams.sortingOrder as string) || undefined
  )
  const lastId: string | undefined = (queryParams.lastId as string)?.toLowerCase()
  const from: number | undefined = qsGetNumber(queryParams, 'from')
  const to: number | undefined = qsGetNumber(queryParams, 'to')

  if (entityTypes && entityTypes.some((type) => !type)) {
    return {
      status: 400,
      body: { error: `Found an unrecognized entity type` }
    }
  }

  if (offset && offset > 5000) {
    return {
      status: 400,
      body: { error: `Offset can't be higher than 5000. Please use the 'next' property for pagination.` }
    }
  }

  // Validate fields are correct or empty
  let enumFields: DeploymentField[] = DEFAULT_FIELDS_ON_DEPLOYMENTS
  if (fields && fields.trim().length > 0) {
    const acceptedValues = Object.values(DeploymentField).map((e) => e.toString())
    enumFields = fields
      .split(',')
      .filter((f) => acceptedValues.includes(f))
      .map((f) => f as DeploymentField)
  }

  // Validate sorting fields and create sortBy
  const sortBy: { field?: SortingField; order?: SortingOrder } = {}
  if (sortingField) {
    if (sortingField == 'unknown') {
      return {
        status: 400,
        body: { error: `Found an unrecognized sort field param` }
      }
    } else {
      sortBy.field = sortingField
    }
  }
  if (sortingOrder) {
    if (sortingOrder == 'unknown') {
      return {
        status: 400,
        body: { error: `Found an unrecognized sort order param` }
      }
    } else {
      sortBy.order = sortingOrder
    }
  }

  const requestFilters = {
    pointers,
    entityTypes: entityTypes as EntityType[],
    entityIds,
    onlyCurrentlyPointed,
    from,
    to
  }

  const deploymentOptions = {
    fields: enumFields,
    filters: requestFilters,
    sortBy: sortBy,
    offset: offset,
    limit: limit,
    lastId: lastId
  }

  const { deployments, filters, pagination } = await context.components.sequentialExecutor.run(
    'GetDeploymentsEndpoint',
    () => getDeployments(context.components, context.components.database, deploymentOptions)
  )
  const controllerDeployments = deployments.map((deployment) =>
    ControllerDeploymentFactory.deployment2ControllerEntity(deployment, enumFields)
  )

  if (deployments.length > 0 && pagination.moreData) {
    const lastDeployment = deployments[deployments.length - 1]
    pagination.next = calculateNextRelativePath(deploymentOptions, lastDeployment)
  }

  return {
    status: 200,
    body: { deployments: controllerDeployments, filters, pagination }
  }
}

function calculateNextRelativePath(options: DeploymentOptions, lastDeployment: Deployment): string {
  const nextFilters = Object.assign({}, options?.filters)

  const field = options?.sortBy?.field ?? SortingField.LOCAL_TIMESTAMP
  const order = options?.sortBy?.order ?? SortingOrder.DESCENDING

  if (field == SortingField.LOCAL_TIMESTAMP) {
    if (order == SortingOrder.ASCENDING) {
      nextFilters.from = lastDeployment.auditInfo.localTimestamp
    } else {
      nextFilters.to = lastDeployment.auditInfo.localTimestamp
    }
  } else {
    if (order == SortingOrder.ASCENDING) {
      nextFilters.from = lastDeployment.entityTimestamp
    } else {
      nextFilters.to = lastDeployment.entityTimestamp
    }
  }

  const fields = !options.fields || options.fields === DEFAULT_FIELDS_ON_DEPLOYMENTS ? '' : options.fields.join(',')

  const nextQueryParams = toQueryParams({
    ...nextFilters,
    fields,
    sortingField: field,
    sortingOrder: order,
    lastId: lastDeployment.entityId,
    limit: options?.limit
  })

  return '?' + nextQueryParams
}

export async function getStatus(
  context: HandlerContextWithPath<'contentCluster' | 'synchronizationState' | 'config', '/status'>
) {
  const { contentCluster, synchronizationState, config } = context.components
  const serverStatus = await statusResponseFromComponents(context.components)
  const ethNetwork = config.getString(EnvironmentConfig[EnvironmentConfig.ETH_NETWORK])

  return {
    status: serverStatus.successful ? 200 : 503,
    body: {
      ...serverStatus.details,
      version: CURRENT_CONTENT_VERSION,
      commitHash: CURRENT_COMMIT_HASH,
      catalystVersion: CURRENT_CATALYST_VERSION,
      ethNetwork,
      synchronizationStatus: {
        ...contentCluster.getStatus(),
        synchronizationState: synchronizationState.getState()
      }
    }
  }
}

// Method: GET
export async function getAllNewSnapshots(context: HandlerContextWithPath<'snapshotGenerator', '/snapshots'>) {
  const metadata = context.components.snapshotGenerator.getCurrentSnapshots()
  if (!metadata) {
    return {
      status: 503,
      body: { error: 'New Snapshots not yet created' }
    }
  }

  return {
    status: 200,
    body: metadata
  }
}

// Method: GET
export async function getFailedDeployments(
  context: HandlerContextWithPath<'failedDeployments', '/failed-deployments'>
) {
  const failedDeployments = await context.components.failedDeployments.getAllFailedDeployments()
  return {
    status: 200,
    body: failedDeployments
  }
}

// Method: GET
export async function getChallenge(context: HandlerContextWithPath<'challengeSupervisor', '/challenge'>) {
  const challengeText = context.components.challengeSupervisor.getChallengeText()
  return {
    status: 200,
    body: { challengeText }
  }
}

function getContentFileHeaders(content: ContentItem, hashId: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    ETag: JSON.stringify(hashId), // by spec, the ETag must be a double-quoted string
    'Access-Control-Expose-Headers': 'ETag',
    'Cache-Control': 'public,max-age=31536000,s-maxage=31536000,immutable'
  }
  if (content.encoding) {
    headers['Content-Encoding'] = content.encoding
  }
  if (content.size) {
    headers['Content-Length'] = content.size.toString()
  }

  return headers
}

export enum EntityField {
  CONTENT = 'content',
  POINTERS = 'pointers',
  METADATA = 'metadata'
}

export enum DeploymentField {
  CONTENT = 'content',
  POINTERS = 'pointers',
  METADATA = 'metadata',
  AUDIT_INFO = 'auditInfo'
}

export type ControllerDenylistData = {
  target: {
    type: string
    id: string
  }
  metadata: {
    timestamp: number
    authChain: AuthChain
  }
}

type ContentFile = {
  path?: string
  content: Buffer
}

const DEFAULT_FIELDS_ON_DEPLOYMENTS: DeploymentField[] = [
  DeploymentField.POINTERS,
  DeploymentField.CONTENT,
  DeploymentField.METADATA
]
