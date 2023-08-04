import { EntityType } from '@dcl/schemas'
import { asEnumValue, fromCamelCaseToSnakeCase } from '../utils.js'
import { qsGetArray, qsGetBoolean, qsGetNumber, qsParser, toQueryParams } from '../../logic/query-params.js'
import { Deployment, DeploymentBase, DeploymentOptions, SortingField, SortingOrder } from '../../deployment-types.js'
import { DeploymentField, HandlerContextWithPath, InvalidRequestError, parseEntityType } from '../../types.js'
import { getDeployments } from '../../logic/deployments.js'

export const DEFAULT_FIELDS_ON_DEPLOYMENTS: DeploymentField[] = [
  DeploymentField.POINTERS,
  DeploymentField.CONTENT,
  DeploymentField.METADATA
]
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
