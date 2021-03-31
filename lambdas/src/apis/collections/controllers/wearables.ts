import { asArray, asInt } from '@katalyst/lambdas/utils/ControllerUtils'
import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { TheGraphClient } from '@katalyst/lambdas/utils/TheGraphClient'
import { EntityType } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import { Request, Response } from 'express'
import { BASE_AVATARS_COLLECTION_ID, OffChainWearablesManager } from '../off-chain/OffChainWearablesManager'
import { Wearable, WearableId, WearablesFilters, WearablesPagination } from '../types'
import { isBaseAvatar, translateEntityIntoWearable } from '../Utils'

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

  try {
    const result = await getWearablesByOwner(owner, includeDefinition, client, theGraphClient)
    res.send(result)
  } catch (e) {
    res.status(500).send(`Failed to fetch wearables by owner. Reason was ${e}`)
  }
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
  // Path: /wearables/?filters&limit={number}&cursor={string}

  const collectionIds: string[] = asArray<string>(req.query.collectionId).map((id) => id.toLowerCase())
  const wearableIds: string[] = asArray<string>(req.query.wearableId).map((id) => id.toLowerCase())
  const textSearch: string | undefined = req.query.textSearch?.toLowerCase()
  const limit: number | undefined = asInt(req.query.limit)
  const cursor: string | undefined = req.query.cursor?.toLowerCase()

  if (collectionIds.length === 0 && wearableIds.length === 0 && !textSearch) {
    return res.status(400).send(`You must use one of the filters: 'textSearch', 'collectionId' or 'wearableId'`)
  } else if (textSearch && textSearch.length < 3) {
    return res.status(400).send(`The text search must be at least 3 characters long`)
  } else if (wearableIds && wearableIds.length > 500) {
    return res.status(400).send(`You can't ask for more than 500 wearables`)
  }

  const requestFilters = {
    collectionIds: collectionIds.length > 0 ? collectionIds : undefined,
    wearableIds: wearableIds.length > 0 ? wearableIds : undefined,
    textSearch
  }
  const sanitizedLimit = !limit || limit <= 0 || limit > 500 ? 500 : limit

  try {
    const { wearables, nextCursor } = await getWearables(
      requestFilters,
      { limit: sanitizedLimit, cursor },
      client,
      theGraphClient,
      offChainManager
    )
    res.send({ wearables, filters: requestFilters, pagination: { limit: sanitizedLimit, cursor, nextCursor } })
  } catch (error) {
    res.status(500).send(error.message)
  }
}

/**
 * This function will return a list of wearables that matches the given filters. It will check off-chain, L1 and L2 wearables.
 * The order will be off-chain > L1 > L2.
 */
export async function getWearables(
  filters: WearablesFilters,
  pagination: WearablesPagination,
  client: SmartContentClient,
  theGraphClient: TheGraphClient,
  offChainManager: OffChainWearablesManager
): Promise<{ wearables: Wearable[]; nextCursor: string | undefined }> {
  let result: Wearable[] = []

  if (!filters.collectionIds && !filters.textSearch) {
    // Since we only have ids, we don't need to query the subgraph at all

    // Check off-chain first. Maybe we don't need to go to the content server
    const offChain = await offChainManager.find(filters)

    let onChain: Wearable[] = []
    if (offChain.length < filters.wearableIds!.length) {
      // It looks like we do need to query the content server after all
      const onChainIds = filters.wearableIds!.filter((wearableId) => !isBaseAvatar(wearableId))
      onChain = await fetchWearables(onChainIds, client)
    }

    result = offChain.concat(onChain)
  } else {
    let limit = pagination.limit
    let lastId: string | undefined = pagination.cursor

    if (!lastId || isBaseAvatar(lastId)) {
      const offChainResult = await offChainManager.find(filters, lastId)
      result = offChainResult
      limit -= offChainResult.length
      lastId = undefined
    }

    // Check if maybe we don't have to check for on-chain wearables, based on the filters
    const onlyBaseAvatars =
      filters.collectionIds &&
      filters.collectionIds.length === 1 &&
      filters.collectionIds[0] === BASE_AVATARS_COLLECTION_ID

    if (!onlyBaseAvatars) {
      const onChain = await getOnChainWearables(filters, { limit, lastId }, theGraphClient, client)
      result.push(...onChain)
    }
  }

  const moreData = result.length > pagination.limit
  const slice = moreData ? result.slice(0, pagination.limit) : result
  return { wearables: slice, nextCursor: moreData ? slice[slice.length - 1]?.id : undefined }
}

async function getOnChainWearables(
  filters: WearablesFilters,
  pagination: { limit: number; lastId: string | undefined },
  theGraphClient: TheGraphClient,
  client: SmartContentClient
) {
  const onChainWearableIds = await theGraphClient.findWearablesByFilters(filters, pagination)
  return fetchWearables(onChainWearableIds, client)
}

function fetchWearables(wearableIds: WearableId[], client: SmartContentClient): Promise<Wearable[]> {
  if (wearableIds.length === 0) {
    return Promise.resolve([])
  }
  return client
    .fetchEntitiesByPointers(EntityType.WEARABLE, wearableIds)
    .then((entities) => entities.map((entity) => translateEntityIntoWearable(client, entity)))
}

async function fetchDefinitions(wearableIds: WearableId[], client: SmartContentClient): Promise<Map<string, Wearable>> {
  const wearables = await fetchWearables(wearableIds, client)
  return new Map(wearables.map((wearable) => [wearable.id.toLowerCase(), wearable]))
}
