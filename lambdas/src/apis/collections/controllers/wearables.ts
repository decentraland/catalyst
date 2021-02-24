import { asArray, asInt } from '@katalyst/lambdas/utils/ControllerUtils'
import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { TheGraphClient } from '@katalyst/lambdas/utils/TheGraphClient'
import { EntityType } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import { Request, Response } from 'express'
import { OffChainWearablesManager } from '../off-chain/OffChainWearablesManager'
import { Wearable, WearableId, WearablesFilters, WearablesPagination } from '../types'
import { translateEntityIntoWearable } from '../Utils'

// Different versions of the same query param
const INCLUDE_DEFINITION_VERSIONS = [
  'includeDefinition',
  'includedefinition',
  'includeDefinitions',
  'includedefinitions'
]

export async function getWearablesByOwnerEndpoint(
  client: SmartContentClient,
  theGraphClient: TheGraphClient,
  req: Request,
  res: Response
) {
  // Method: GET
  // Path: /wearables-by-owner/:owner

  const { owner } = req.params
  const includeDefinition = INCLUDE_DEFINITION_VERSIONS.some((version) => version in req.query)

  const result = await getWearablesByOwner(owner, includeDefinition, client, theGraphClient)
  res.send(result)
}

export async function getWearablesByOwner(
  owner: EthAddress,
  includeDefinition: boolean,
  client: SmartContentClient,
  theGraphClient: TheGraphClient
): Promise<{ urn: WearableId; amount: number; definition?: Wearable | undefined }[]> {
  // Fetch wearables & definitions (if needed)
  const wearablesByOwner = await theGraphClient.findWearablesByOwner(owner)
  const definitions: Map<WearableId, Wearable> = includeDefinition
    ? await fetchDefinitions(wearablesByOwner, client)
    : new Map()

  // Count wearables by user
  const count: Map<WearableId, number> = new Map()
  for (const wearableId of wearablesByOwner) {
    const amount = count.get(wearableId) ?? 0
    count.set(wearableId, amount + 1)
  }

  // Return result
  return Array.from(count.entries()).map(([id, amount]) => ({
    urn: id,
    amount,
    definition: definitions.get(id)
  }))
}

export async function getWearablesEndpoint(
  client: SmartContentClient,
  theGraphClient: TheGraphClient,
  offChainManager: OffChainWearablesManager,
  req: Request,
  res: Response
) {
  // Method: GET
  // Path: /wearables/?filters&limit={number}&offset={number}

  const collectionIds: string[] = asArray<string>(req.query.collectionId).map((id) => id.toLowerCase())
  const wearableIds: string[] = asArray<string>(req.query.wearableId).map((id) => id.toLowerCase())
  const textSearch: string | undefined = req.query.textSearch?.toLowerCase()
  const offset: number | undefined = asInt(req.query.offset)
  const limit: number | undefined = asInt(req.query.limit)

  if (collectionIds.length === 0 && wearableIds.length === 0 && !textSearch) {
    return res.status(400).send(`You must use one of the filters: 'textSearch', 'collectionId' or 'wearableId'`)
  }

  const requestFilters = {
    collectionIds: collectionIds.length > 0 ? collectionIds : undefined,
    wearableIds: wearableIds.length > 0 ? wearableIds : undefined,
    textSearch
  }
  const sanitizedPagination = sanitizePagination(offset, limit)

  try {
    const response = await getWearables(requestFilters, sanitizedPagination, client, theGraphClient, offChainManager)
    res.send(response)
  } catch (error) {
    res.status(500).send(error.message)
  }
}

/**
 * As Base Wearables are off chain, we need to return both off-chain and on-chain wearables in the same query.
 * To do that, we use the order of first rendering off-chain wearables and then on-chain wearables,
 * that order is used to paginate elements.
 */
export async function getWearables(
  filters: WearablesFilters,
  pagination: WearablesPagination,
  client: SmartContentClient,
  theGraphClient: TheGraphClient,
  offChainManager: OffChainWearablesManager
): Promise<{
  wearables: Wearable[]
  filters: { collectionIds?: string[]; wearableIds?: string[]; textSearch?: string }
  pagination: { offset: number; limit: number; moreData: boolean }
}> {
  // [TRICK] Get one more element than necessary to check if there is moreData
  const paginationLimitWithMore = pagination.limit + 1
  const offChainWearables = await offChainManager.find(filters)
  const paginatedOffChainWearablesWithMore = offChainWearables.slice(
    pagination.offset,
    pagination.offset + paginationLimitWithMore
  )

  // Calculate offset and limit for getting the on-chain wearables depending on the off-chain wearables result
  const onChainPagination = {
    offset: Math.max(0, pagination.offset - offChainWearables.length),
    limit: Math.max(0, paginationLimitWithMore - paginatedOffChainWearablesWithMore.length)
  }
  // Get the on-chain wearables, if corresponds one more element will be returned
  const onChainWearablesWithMore: Wearable[] = await getOnChainWearables(
    onChainPagination,
    theGraphClient,
    filters,
    client
  )

  // Check if there is moreData and then slice for the correct limit
  const allWearablesWithMore = paginatedOffChainWearablesWithMore.concat(onChainWearablesWithMore)
  const moreData: boolean = allWearablesWithMore.length > pagination.limit
  const allWearables = allWearablesWithMore.slice(0, pagination.limit)

  return {
    wearables: allWearables,
    filters,
    pagination: { ...pagination, moreData: moreData }
  }
}

async function getOnChainWearables(
  pagination: { offset: number; limit: number },
  theGraphClient: TheGraphClient,
  filters: WearablesFilters,
  client: SmartContentClient
) {
  let onChainWearables: Wearable[] = []

  if (pagination.limit > 0) {
    const onChainWearableIds = await theGraphClient.findWearablesByFilters(filters, pagination)
    if (onChainWearableIds.length > 0) {
      onChainWearables = await client
        .fetchEntitiesByPointers(EntityType.WEARABLE, onChainWearableIds)
        .then((entities) => entities.map((entity) => translateEntityIntoWearable(client, entity)))
    }
  }
  return onChainWearables
}

function sanitizePagination(offset: number | undefined, limit: number | undefined): WearablesPagination {
  if (!offset || offset < 0) {
    offset = 0
  }
  if (!limit || limit <= 0 || limit > 500) {
    limit = 500
  }
  return { offset, limit }
}

async function fetchDefinitions(wearableIds: WearableId[], client: SmartContentClient): Promise<Map<string, Wearable>> {
  const entities = await client.fetchEntitiesByPointers(EntityType.WEARABLE, wearableIds)
  return new Map(
    entities
      .filter((entity) => !!entity.metadata)
      .map((entity) => [entity.pointers[0], translateEntityIntoWearable(client, entity)])
  )
}
