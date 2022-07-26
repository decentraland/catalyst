import { EntityType } from '@dcl/schemas'
import { Request, Response } from 'express'
import log4js from 'log4js'
import { findThirdPartyItemUrns } from '../../../logic/third-party-urn-finder'
import { toQueryParams } from '../../../logic/toQueryParams'
import { ThirdPartyAssetFetcher } from '../../../ports/third-party/third-party-fetcher'
import { asArray, asInt } from '../../../utils/ControllerUtils'
import { SmartContentClient } from '../../../utils/SmartContentClient'
import { TheGraphClient } from '../../../utils/TheGraphClient'
import { ItemFilters, ItemPagination, LambdasEmote } from './utils/types'
import { translateEntityIntoEmote } from './utils/Utils'

const LOGGER = log4js.getLogger('TheGraphClient')

export async function getEmotesByOwnerHandler(
  client: SmartContentClient,
  theGraphClient: TheGraphClient,
  thirdPartyFetcher: ThirdPartyAssetFetcher,
  req: Request,
  res: Response
): Promise<void> {
  // Method: GET
  // Path: /emotes-by-owner/:owner?collectionId={string}
  const { owner } = req.params
  const collectionId = req.query.collectionId
  if (collectionId && typeof collectionId !== 'string') {
    throw new Error('Bad input. CollectionId must be a string.')
  }
  const includeDefinition = 'includeDefinitions' in req.query

  try {
    res.send(await getEmotesByOwner(includeDefinition, client, theGraphClient, thirdPartyFetcher, collectionId, owner))
  } catch (e) {
    LOGGER.error(e)
    res.status(500).send(`Failed to fetch emotes by owner.`)
  }
}

export async function getEmotesByOwner(
  includeDefinition: boolean,
  client: SmartContentClient,
  theGraphClient: TheGraphClient,
  thirdPartyFetcher: ThirdPartyAssetFetcher,
  thirdPartyCollectionId: string | undefined,
  owner: string
): Promise<{ urn: string; amount: number; definition?: LambdasEmote | undefined }[]> {
  const ownedEmoteUrns = thirdPartyCollectionId
    ? await findThirdPartyItemUrns(theGraphClient, thirdPartyFetcher, owner, thirdPartyCollectionId)
    : await theGraphClient.findEmoteUrnsByOwner(owner)
  return getEmotesByOwnerFromUrns(includeDefinition, client, ownedEmoteUrns)
}

export async function getEmotesByOwnerFromUrns(
  includeDefinition: boolean,
  client: SmartContentClient,
  emoteUrns: string[]
): Promise<{ urn: string; amount: number; definition?: LambdasEmote | undefined }[]> {
  // Fetch definitions (if needed)
  const emotes = includeDefinition ? await fetchEmotes(emoteUrns, client) : []
  const emotesByUrn: Map<string, LambdasEmote> = new Map(emotes.map((emote) => [emote.id.toLowerCase(), emote]))

  // Count emotes by id
  const countByUrn: Map<string, number> = new Map()
  for (const urn of emoteUrns) {
    const amount = countByUrn.get(urn) ?? 0
    countByUrn.set(urn, amount + 1)
  }

  // Return result
  return Array.from(countByUrn.entries()).map(([urn, amount]) => ({
    urn,
    amount,
    definition: emotesByUrn.get(urn.toLowerCase())
  }))
}

const MAX_LIMIT = 500

export async function getEmotesHandler(
  client: SmartContentClient,
  theGraphClient: TheGraphClient,
  req: Request,
  res: Response
): Promise<unknown> {
  // Method: GET
  // Path: /emotes/?filters&limit={number}&lastId={string}

  const collectionIds: string[] = asArray<string>(req.query.collectionId as string).map((id) => id.toLowerCase())
  const emoteIds: string[] = asArray<string>(req.query.emoteId as string).map((id) => id.toLowerCase())
  const textSearch: string | undefined = (req.query.textSearch as string | undefined)?.toLowerCase()
  const limit: number | undefined = asInt(req.query.limit)
  const lastId: string | undefined = (req.query.lastId as string | undefined)?.toLowerCase()

  if (collectionIds.length === 0 && emoteIds.length === 0 && !textSearch) {
    return res.status(400).send(`You must use one of the filters: 'textSearch', 'collectionId' or 'emoteId'`)
  } else if (textSearch && textSearch.length < 3) {
    return res.status(400).send(`The text search must be at least 3 characters long`)
  } else if (emoteIds && emoteIds.length > MAX_LIMIT) {
    return res.status(400).send(`You can't ask for more than ${MAX_LIMIT} emotes`)
  } else if (collectionIds && collectionIds.length > MAX_LIMIT) {
    return res.status(400).send(`You can't filter for more than ${MAX_LIMIT} collection ids`)
  }

  const requestFilters = {
    collectionIds: collectionIds.length > 0 ? collectionIds : undefined,
    itemIds: emoteIds.length > 0 ? emoteIds : undefined,
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
    LOGGER.error(error)
    res.status(500)
  }
}

/**
 * This function will return a list of emotes that matches the given filters. It will check L1 and L2 emotes.
 * The order will be L1 > L2.
 */
export async function getEmotes(
  filters: ItemFilters,
  pagination: ItemPagination,
  client: SmartContentClient,
  theGraphClient: TheGraphClient
): Promise<{ emotes: LambdasEmote[]; lastId: string | undefined }> {
  const result: LambdasEmote[] = []

  if (!filters.collectionIds && !filters.textSearch) {
    // Since we only have ids, we don't need to query the subgraph at all
    let onChain: LambdasEmote[] = []
    if (filters.itemIds) {
      onChain = await fetchEmotes(filters.itemIds, client)
    }
    result.push(...onChain)
  } else {
    const limit = pagination.limit
    const lastId: string | undefined = pagination.lastId

    const onChainUrns = await theGraphClient.findEmoteUrnsByFilters(filters, { limit, lastId })
    const onChain = await fetchEmotes(onChainUrns, client)
    result.push(...onChain)
  }

  const moreData = result.length > pagination.limit
  const slice = moreData ? result.slice(0, pagination.limit) : result
  return { emotes: slice, lastId: moreData ? slice[slice.length - 1]?.id : undefined }
}

async function fetchEmotes(emoteUrns: string[], client: SmartContentClient): Promise<LambdasEmote[]> {
  if (emoteUrns.length === 0) {
    return []
  }
  const entities = await client.fetchEntitiesByPointers(EntityType.EMOTE, emoteUrns)
  const emotes = entities.map((entity) => translateEntityIntoEmote(client, entity))
  return emotes.sort((emote1, emote2) => emote1.id.toLowerCase().localeCompare(emote2.id.toLowerCase()))
}
