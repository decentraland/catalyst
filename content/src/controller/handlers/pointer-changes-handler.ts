import { GetPointerChanges200 } from '@dcl/catalyst-api-specs/lib/client/client.schemas'
import { EntityType, PointerChangesSyncDeployment } from '@dcl/schemas'
import { asEnumValue, fromCamelCaseToSnakeCase } from '../utils'
import { qsGetArray, qsGetBoolean, qsGetNumber, qsParser, toQueryParams } from '../../logic/query-params'
import { HandlerContextWithPath, InvalidRequestError, parseEntityType } from '../../types'
import { SortingField, SortingOrder } from '../../deployment-types'
import { PointerChangesFilters } from '../../service/pointers/types'
import { getPointerChanges } from '../../service/pointers/pointers'

// Method: GET
// Query String: ?from={timestamp}&to={timestamp}&offset={number}&limit={number}&entityType={entityType}&includeAuthChain={boolean}
export async function getPointerChangesHandler(
  context: HandlerContextWithPath<'database' | 'denylist' | 'sequentialExecutor' | 'metrics', '/pointer-changes'>
): Promise<{ status: 200; body: Required<GetPointerChanges200> }> {
  const queryParams = qsParser(context.url.searchParams)

  const entityTypes: (EntityType | undefined)[] = qsGetArray(queryParams, 'entityType').map((type) =>
    parseEntityType(type)
  )

  const from: number | undefined = qsGetNumber(queryParams, 'from')
  const to: number | undefined = qsGetNumber(queryParams, 'to')
  const offset: number | undefined = qsGetNumber(queryParams, 'offset')
  const limit: number | undefined = qsGetNumber(queryParams, 'limit')
  const lastId: string | undefined = (queryParams.lastId as string)?.toLowerCase()
  const includeAuthChain = qsGetBoolean(queryParams, 'includeAuthChain') ?? false

  const sortingFieldParam: string | undefined = queryParams.sortingField as string
  const snake_case_sortingField = sortingFieldParam ? fromCamelCaseToSnakeCase(sortingFieldParam) : undefined
  const sortingField: SortingField | undefined | 'unknown' = asEnumValue(SortingField, snake_case_sortingField)
  const sortingOrder: SortingOrder | undefined | 'unknown' = asEnumValue(
    SortingOrder,
    (queryParams.sortingOrder as string) || undefined
  )

  // Validate type is valid
  if (entityTypes && entityTypes.some((type) => !type)) {
    throw new InvalidRequestError(`Found an unrecognized entity type`)
  }

  if (offset && offset > 5000) {
    throw new InvalidRequestError(`Offset can't be higher than 5000. Please use the 'next' property for pagination.`)
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
    entityTypes: entityTypes as EntityType[] | undefined,
    from,
    to,
    includeAuthChain
  }

  const { pointerChanges, filters, pagination } = await context.components.sequentialExecutor.run(
    'GetPointerChangesEndpoint',
    () =>
      getPointerChanges(context.components, context.components.database, {
        filters: requestFilters,
        offset,
        limit,
        lastId,
        sortBy
      })
  )

  if (pointerChanges.length > 0 && pagination.moreData) {
    const lastPointerChange = pointerChanges[pointerChanges.length - 1]
    pagination.next = calculateNextRelativePathForPointer(lastPointerChange, pagination.limit, filters)
  }

  const response = { deltas: pointerChanges, filters, pagination }
  return {
    status: 200,
    body: response
  }
}

function calculateNextRelativePathForPointer(
  lastPointerChange: PointerChangesSyncDeployment,
  limit: number,
  filters?: PointerChangesFilters
): string | undefined {
  const nextFilters = Object.assign({}, filters)
  // It will always use toLocalTimestamp as this endpoint is always sorted with the default config: localTimestamp and DESC
  nextFilters.to = lastPointerChange.localTimestamp

  const nextQueryParams = toQueryParams({
    ...nextFilters,
    limit: limit,
    lastId: lastPointerChange.entityId
  })

  return '?' + nextQueryParams
}
