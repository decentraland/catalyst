import { ContentItem } from '@dcl/catalyst-storage'
import { EntityType } from '@dcl/schemas'
import { asEnumValue, fromCamelCaseToSnakeCase } from './utils'
import { Deployment, DeploymentBase, DeploymentOptions, SortingField, SortingOrder } from '../deployment-types'
import { getActiveDeploymentsByContentHash } from '../logic/database-queries/deployments-queries'
import { getDeployments } from '../logic/deployments'
import { findEntityByPointer, findImageHash, findThumbnailHash } from '../logic/entities'
import { buildUrn, formatERC21Entity, getProtocol } from '../logic/erc721'
import { qsGetArray, qsGetBoolean, qsGetNumber, qsParser, toQueryParams } from '../logic/query-params'
import { DeploymentField, HandlerContextWithPath, InvalidRequestError, NotFoundError, parseEntityType } from '../types'

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
  const from = qsGetNumber(queryParams, 'from')
  const to = qsGetNumber(queryParams, 'to')

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
      throw new InvalidRequestError(`Found an unrecognized sort field param`)
    } else {
      sortBy.field = sortingField
    }
  }
  if (sortingOrder) {
    if (sortingOrder == 'unknown') {
      throw new InvalidRequestError(`Found an unrecognized sort order param`)
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
  const controllerDeployments = deployments.map((deployment) => deployment2ControllerEntity(deployment, enumFields))

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

const DEFAULT_FIELDS_ON_DEPLOYMENTS: DeploymentField[] = [
  DeploymentField.POINTERS,
  DeploymentField.CONTENT,
  DeploymentField.METADATA
]

function deployment2ControllerEntity<T extends DeploymentBase>(deployment: Deployment, fields: DeploymentField[]): T {
  const { pointers, auditInfo, content, metadata, ...other } = deployment
  const result: any = { ...other }
  if (fields.includes(DeploymentField.POINTERS)) {
    result.pointers = pointers
  }
  if (content && fields.includes(DeploymentField.CONTENT)) {
    result.content = content
  }
  if (metadata && fields.includes(DeploymentField.METADATA)) {
    result.metadata = metadata
  }
  if (fields.includes(DeploymentField.AUDIT_INFO)) {
    result.auditInfo = auditInfo
  }
  result.localTimestamp = auditInfo.localTimestamp
  return result
}
