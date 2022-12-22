import { Request, Response } from 'express'
import log4js from 'log4js'
import { findThirdPartyItemUrns } from '../../../logic/third-party-urn-finder'
import { toQueryParams } from '../../../logic/toQueryParams'
import { ThirdPartyAssetFetcher } from '../../../ports/third-party/third-party-fetcher'
import { asArray, asInt } from '../../../utils/ControllerUtils'
import { SmartContentClient } from '../../../utils/SmartContentClient'
import { TheGraphClient } from '../../../utils/TheGraphClient'
import { BASE_AVATARS_COLLECTION_ID, OffChainWearablesManager } from '../off-chain/OffChainWearablesManager'
import { ItemFilters, ItemPagination, LambdasWearable } from '../types'
import { isBaseAvatar, translateEntityIntoWearable } from '../Utils'

const LOGGER = log4js.getLogger('WearablesHandler')

export async function getWearablesByOwnerHandler(
  client: SmartContentClient,
  theGraphClient: TheGraphClient,
  thirdPartyFetcher: ThirdPartyAssetFetcher,
  req: Request,
  res: Response
): Promise<void> {
  // Method: GET
  // Path: /wearables-by-owner/:owner?collectionId={string}
  const { owner } = req.params
  const collectionId = req.query.collectionId
  if (collectionId && typeof collectionId !== 'string') {
    throw new Error('Bad input. CollectionId must be a string.')
  }

  const includeDefinitions = 'includeDefinitions' in req.query

  try {
    res.send(
      await getWearablesByOwner(includeDefinitions, client, theGraphClient, thirdPartyFetcher, collectionId, owner)
    )
  } catch (e) {
    LOGGER.error(e)
    res.status(500).send(`Failed to fetch wearables by owner.`)
  }
}

export async function getWearablesByOwner(
  includeDefinitions: boolean,
  client: SmartContentClient,
  theGraphClient: TheGraphClient,
  thirdPartyFetcher: ThirdPartyAssetFetcher,
  thirdPartyCollectionId: string | undefined,
  owner: string
): Promise<{ urn: string; amount: number; definition?: LambdasWearable | undefined }[]> {
  const ownedWearableUrns = thirdPartyCollectionId
    ? await findThirdPartyItemUrns(theGraphClient, thirdPartyFetcher, owner, thirdPartyCollectionId)
    : await theGraphClient.findWearableUrnsByOwner(owner)
  return getWearablesByOwnerFromUrns(includeDefinitions, client, ownedWearableUrns)
}

export async function getWearablesByOwnerFromUrns(
  includeDefinitions: boolean,
  client: SmartContentClient,
  wearableUrns: string[]
): Promise<{ urn: string; amount: number; definition?: LambdasWearable | undefined }[]> {
  // Fetch definitions (if needed)
  const wearables = includeDefinitions ? await fetchWearables(wearableUrns, client) : []
  const wearablesByUrn: Map<string, LambdasWearable> = new Map(
    wearables.map((wearable) => [wearable.id.toLowerCase(), wearable])
  )

  // Count wearables by id
  const countByUrn: Map<string, number> = new Map()
  for (const urn of wearableUrns) {
    const amount = countByUrn.get(urn) ?? 0
    countByUrn.set(urn, amount + 1)
  }

  // Return result
  return Array.from(countByUrn.entries()).map(([urn, amount]) => ({
    urn,
    amount,
    definition: wearablesByUrn.get(urn.toLowerCase())
  }))
}

const MAX_LIMIT = 500

// Method: GET
// Path: /collections/wearables/?filters&limit={number}&lastId={string}
export async function getWearablesHandler(
  client: SmartContentClient,
  theGraphClient: TheGraphClient,
  offChainManager: OffChainWearablesManager,
  req: Request,
  res: Response
): Promise<unknown> {
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
    itemIds: wearableIds.length > 0 ? wearableIds : undefined,
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

    const nextQueryParams = toQueryParams({
      ...requestFilters,
      lastId: nextLastId?.toString(),
      limit: sanitizedLimit.toString()
    })
    const next = nextLastId ? '?' + nextQueryParams : undefined

    res.send({ wearables, filters: requestFilters, pagination: { limit: sanitizedLimit, lastId, next } })
  } catch (error) {
    LOGGER.error(error)
    res.status(500).end()
  }
}

/**
 * This function will return a list of wearables that matches the given filters. It will check off-chain, L1 and L2 wearables.
 * The order will be off-chain > L1 > L2.
 */
export async function getWearables(
  filters: ItemFilters,
  pagination: ItemPagination,
  client: SmartContentClient,
  theGraphClient: TheGraphClient,
  offChainManager: OffChainWearablesManager
): Promise<{ wearables: LambdasWearable[]; lastId: string | undefined }> {
  let result: LambdasWearable[] = []

  if (!filters.collectionIds && !filters.textSearch) {
    // Since we only have ids, we don't need to query the subgraph at all

    // Check off-chain first. Maybe we don't need to go to the content server
    const offChain = await offChainManager.find(filters)

    let onChain: LambdasWearable[] = []
    if (filters.itemIds && offChain.length < filters.itemIds.length) {
      // It looks like we do need to query the content server after all
      const onChainIds = filters.itemIds.filter((wearableId) => !isBaseAvatar(wearableId))
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
      const onChainIds = await theGraphClient.findWearableUrnsByFilters(filters, { limit, lastId })
      const onChain = await fetchWearables(onChainIds, client)
      result.push(...onChain)
    }
  }

  const moreData = result.length > pagination.limit
  const slice = moreData ? result.slice(0, pagination.limit) : result
  return { wearables: slice, lastId: moreData ? slice[slice.length - 1]?.id : undefined }
}

async function fetchWearables(wearableUrns: string[], client: SmartContentClient): Promise<LambdasWearable[]> {
  if (wearableUrns.length === 0) {
    return []
  }

  const entities = await client.fetchEntitiesByPointers(wearableUrns)
  const wearables = entities
    .map((entity) => translateEntityIntoWearable(client, entity))
    .filter((wearable): wearable is LambdasWearable => !!wearable)

  return wearables.sort((wearable1, wearable2) => wearable1.id.toLowerCase().localeCompare(wearable2.id.toLowerCase()))
}
