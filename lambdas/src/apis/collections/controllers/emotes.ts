import { EthAddress } from '@dcl/crypto'
import { Emote, EntityType } from '@dcl/schemas'
import { Request, Response } from 'express'
import log4js from 'log4js'
import { toQueryParams } from '../../../logic/toQueryParams'
import { asArray, asInt } from '../../../utils/ControllerUtils'
import { SmartContentClient } from '../../../utils/SmartContentClient'
import { TheGraphClient } from '../../../utils/TheGraphClient'
import { createThirdPartyResolverAux } from '../../../utils/third-party'
import { OffChainWearablesManager } from '../off-chain/OffChainWearablesManager'
import { EmoteId, ItemFilters, ItemPagination } from '../types'

// Different versions of the same query param
const INCLUDE_DEFINITION_VERSIONS = [
  'includeDefinition',
  'includedefinition',
  'includeDefinitions',
  'includedefinitions'
]

const LOGGER = log4js.getLogger('TheGraphClient')

export async function getEmotesByOwnerEndpoint(
  client: SmartContentClient,
  theGraphClient: TheGraphClient,
  req: Request,
  res: Response
): Promise<void> {
  // Method: GET
  // Path: /emotes-by-owner/:owner?collectionId={string}

  const { owner } = req.params
  const { collectionId } = req.query
  const includeDefinition = INCLUDE_DEFINITION_VERSIONS.some((version) => version in req.query)

  try {
    const wearablesByOwner = await getEmotesByOwner(
      owner,
      includeDefinition,
      client,
      collectionId
        ? await createThirdPartyResolverAux(
          theGraphClient,
          collectionId as string
        )
        : theGraphClient
    )
    res.send(wearablesByOwner)
  } catch (e) {
    LOGGER.error(e)
    res.status(500).send(`Failed to fetch emotes by owner.`)
  }
}
export interface FindWearablesByOwner {
  findWearablesByOwner: (owner: EthAddress) => Promise<EmoteId[]>
}

export async function getEmotesByOwner(
  owner: EthAddress,
  includeDefinition: boolean,
  client: SmartContentClient,
  wearablesResolver: FindWearablesByOwner
): Promise<{ urn: EmoteId; amount: number; definition?: Emote | undefined }[]> {
  // Fetch wearables & definitions (if needed)
  const wearablesByOwner = await wearablesResolver.findWearablesByOwner(owner)
  const definitions: Map<EmoteId, Emote> = includeDefinition
    ? await fetchDefinitions(wearablesByOwner, client)
    : new Map()

  // Count wearables by user
  const count: Map<EmoteId, number> = new Map()
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

export async function getEmotesEndpoint(
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
    wearableIds: wearableIds.length > 0 ? wearableIds : undefined,
    textSearch
  }
  const sanitizedLimit = !limit || limit <= 0 || limit > MAX_LIMIT ? MAX_LIMIT : limit

  try {
    const { emotes, lastId: nextLastId } = await getEmotes(
      requestFilters,
      { limit: sanitizedLimit, lastId },
      client,
      theGraphClient
    )

    const nextQueryParams = toQueryParams({
      ...requestFilters,
      lastId: nextLastId?.toString(),
      limit: sanitizedLimit.toString()
    })
    const next = nextLastId ? '?' + nextQueryParams : undefined

    res.send({ emotes, filters: requestFilters, pagination: { limit: sanitizedLimit, lastId, next } })
  } catch (error) {
    res.status(500)
  }
}

/**
 * This function will return a list of wearables that matches the given filters. It will check off-chain, L1 and L2 wearables.
 * The order will be off-chain > L1 > L2.
 */
export async function getEmotes(
  filters: ItemFilters,
  pagination: ItemPagination,
  client: SmartContentClient,
  theGraphClient: TheGraphClient
): Promise<{ emotes: Emote[]; lastId: string | undefined }> {
  let result: Emote[] = []

  if (filters.collectionIds || filters.textSearch) {
    const limit = pagination.limit
    const lastId: string | undefined = pagination.lastId

    const onChainIds = await theGraphClient.findWearablesByFilters(filters, { limit, lastId })
    const onChain = await fetchEmotes(onChainIds, client)
    result.push(...onChain)
  }

  const moreData = result.length > pagination.limit
  const slice = moreData ? result.slice(0, pagination.limit) : result
  return { emotes: slice, lastId: moreData ? slice[slice.length - 1]?.id : undefined }
}

async function fetchEmotes(wearableIds: EmoteId[], client: SmartContentClient): Promise<Emote[]> {
  if (wearableIds.length === 0) {
    return []
  }
  const entities = await client.fetchEntitiesByPointers(EntityType.EMOTE, wearableIds)
  return entities.map((entity) => entity.metadata)
}

async function fetchDefinitions(wearableIds: EmoteId[], client: SmartContentClient): Promise<Map<string, Emote>> {
  const wearables = await fetchEmotes(wearableIds, client)
  return new Map(wearables.map((wearable) => [wearable.id.toLowerCase(), wearable]))
}
