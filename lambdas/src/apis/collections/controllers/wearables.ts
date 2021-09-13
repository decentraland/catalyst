import { toQueryParams } from '@catalyst/commons'
import { EntityType } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import { Request, Response } from 'express'
import { asArray, asInt } from '../../../utils/ControllerUtils'
import { SmartContentClient } from '../../../utils/SmartContentClient'
import { TheGraphClient } from '../../../utils/TheGraphClient'
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
    definition: definitions.get(id.toLowerCase())
  }))
}

const MAX_LIMIT = 500

export async function getWearablesEndpoint(
  client: SmartContentClient,
  theGraphClient: TheGraphClient,
  offChainManager: OffChainWearablesManager,
  req: Request,
  res: Response
) {
  // Method: GET
  // Path: /wearables/?filters&limit={number}&lastId={string}

  const collectionIds: string[] = asArray<string>(req.query.collectionId as string).map((id) => id.toLowerCase())
  const wearableIds: string[] = asArray<string>(req.query.wearableId as string).map((id) => id.toLowerCase())
  const textSearch: string | undefined = (req.query.textSearch as string | undefined)?.toLowerCase()
  const limit: number | undefined = asInt(req.query.limit)
  const lastId: string | undefined = (req.query.lastId as string | undefined)?.toLowerCase()

  if (collectionIds.length === 0 && wearableIds.length === 0 && !textSearch) {
    return res.status(400).send(`You must use one of the filters: 'textSearch', 'collectionId' or 'wearableId'`)
  } else if (textSearch && textSearch.length < 3) {
    return res.status(400).send(`The text search must be at least 3 characters long`)
  } else if (wearableIds && wearableIds.length > MAX_LIMIT) {
    return res.status(400).send(`You can't ask for more than ${MAX_LIMIT} wearables`)
  } else if (collectionIds && collectionIds.length > MAX_LIMIT) {
    return res.status(400).send(`You can't filter for more than ${MAX_LIMIT} collection ids`)
  }

  const requestFilters = {
    collectionIds: collectionIds.length > 0 ? collectionIds : undefined,
    wearableIds: wearableIds.length > 0 ? wearableIds : undefined,
    textSearch
  }
  const sanitizedLimit = !limit || limit <= 0 || limit > MAX_LIMIT ? MAX_LIMIT : limit

  try {
    const { wearables, lastId: nextLastId } = await getWearables(
      requestFilters,
      { limit: sanitizedLimit, lastId },
      client,
      theGraphClient,
      offChainManager
    )

    const nextQueryParams = toQueryParams({ ...requestFilters, lastId: nextLastId, limit: sanitizedLimit })
    const next = nextLastId ? '?' + nextQueryParams : undefined

    res.send({ wearables, filters: requestFilters, pagination: { limit: sanitizedLimit, lastId, next } })
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
): Promise<{ wearables: Wearable[]; lastId: string | undefined }> {
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
    let lastId: string | undefined = pagination.lastId

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
      const onChainIds = await theGraphClient.findWearablesByFilters(filters, { limit, lastId })
      const onChain = await fetchWearables(onChainIds, client)
      result.push(...onChain)
    }
  }

  const moreData = result.length > pagination.limit
  const slice = moreData ? result.slice(0, pagination.limit) : result
  return { wearables: slice, lastId: moreData ? slice[slice.length - 1]?.id : undefined }
}

function fetchWearables(wearableIds: WearableId[], client: SmartContentClient): Promise<Wearable[]> {
  if (wearableIds.length === 0) {
    return Promise.resolve([])
  }
  return client
    .fetchEntitiesByPointers(EntityType.WEARABLE, wearableIds)
    .then((entities) => entities.map((entity) => translateEntityIntoWearable(client, entity)))
    .then((wearables) =>
      wearables.sort((wearable1, wearable2) => wearable1.id.toLowerCase().localeCompare(wearable2.id.toLowerCase()))
    )
}

async function fetchDefinitions(wearableIds: WearableId[], client: SmartContentClient): Promise<Map<string, Wearable>> {
  const wearables = await fetchWearables(wearableIds, client)
  return new Map(wearables.map((wearable) => [wearable.id.toLowerCase(), wearable]))
}
