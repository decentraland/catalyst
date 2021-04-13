import { DeploymentFilters, EntityType, SortingField, SortingOrder } from 'dcl-catalyst-commons'
import qs from 'qs'

export function toQueryParamsForGetAllDeployments(
  filters?: DeploymentFilters,
  field?: SortingField,
  order?: SortingOrder,
  entityId?: string,
  limit?: number
): string {
  return qs.stringify(
    {
      from: filters?.from,
      to: filters?.to,
      fromLocalTimestamp: filters?.fromLocalTimestamp,
      toLocalTimestamp: filters?.toLocalTimestamp,
      deployedBy: filters?.deployedBy,
      entityType: filters?.entityTypes,
      entityId: filters?.entityIds,
      pointer: filters?.pointers,
      onlyCurrentlyPointed: filters?.onlyCurrentlyPointed,
      limit: limit,
      sortingField: field,
      sortingOrder: order,
      lastId: entityId
    },
    { arrayFormat: 'repeat' }
  )
}

export function toQueryParamsForPointerChanges(
  to: number,
  entityTypes: EntityType[] | undefined,
  limit: number,
  lastPointerChangeId?: string,
  from?: number,
  toLocalTimestamp?: number,
  fromLocalTimestamp?: number
): string {
  return qs.stringify(
    {
      to: to,
      from: from,
      toLocalTimestamp: toLocalTimestamp,
      fromLocalTimestamp: fromLocalTimestamp,
      entityType: entityTypes,
      limit: limit,
      lastId: lastPointerChangeId
    },
    { arrayFormat: 'repeat' }
  )
}

export function toQueryParamsForWearables(
  requestFilters: {
    collectionIds: string[] | undefined
    wearableIds: string[] | undefined
    textSearch: string | undefined
  },
  nextLastId: string | undefined,
  sanitizedLimit: number
): string {
  return qs.stringify(
    {
      collectionId: requestFilters.collectionIds,
      wearableId: requestFilters.wearableIds,
      textSearch: requestFilters.textSearch,
      lastId: nextLastId,
      limit: sanitizedLimit
    },
    { arrayFormat: 'repeat' }
  )
}
