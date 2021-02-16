import { asArray } from '@katalyst/lambdas/utils/ControllerUtils'
import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { TheGraphClient } from '@katalyst/lambdas/utils/TheGraphClient'
import { EntityType } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import { Request, Response } from 'express'
import { OffChainWearablesManager } from '../off-chain/OffChainWearablesManager'
import { Wearable, WearableId, WearablesFilters } from '../types'
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
  // Path: /wearables/?filters

  const collectionIds: string[] = asArray<string>(req.query.collectionId).map((id) => id.toLowerCase())
  const wearableIds: string[] = asArray<string>(req.query.wearableId).map((id) => id.toLowerCase())
  const textSearch: string | undefined = req.query.textSearch?.toLowerCase()

  if (collectionIds.length === 0 && wearableIds.length === 0 && !textSearch) {
    return res.status(400).send(`You must use one of the filters: 'textSearch', 'collectionId' or 'wearableId'`)
  }

  const filters = {
    collectionIds: collectionIds.length > 0 ? collectionIds : undefined,
    wearableIds: wearableIds.length > 0 ? wearableIds : undefined,
    textSearch
  }

  try {
    const result = await getWearables(filters, client, theGraphClient, offChainManager)
    res.send(result)
  } catch (error) {
    res.status(500).send(error.message)
  }
}

export async function getWearables(
  filters: WearablesFilters,
  client: SmartContentClient,
  theGraphClient: TheGraphClient,
  offChainManager: OffChainWearablesManager
): Promise<Wearable[]> {
  const offChainPromise = offChainManager.find(filters)
  const onChainPromise = theGraphClient
    .findWearablesByFilters(filters)
    .then((ids) => (ids.length > 0 ? client.fetchEntitiesByPointers(EntityType.WEARABLE, ids) : []))
    .then((entities) => entities.map((entity) => translateEntityIntoWearable(client, entity)))

  const [offChainWearables, onChainWearables] = await Promise.all([offChainPromise, onChainPromise])
  return offChainWearables.concat(onChainWearables)
}

async function fetchDefinitions(wearableIds: WearableId[], client: SmartContentClient): Promise<Map<string, Wearable>> {
  const entities = await client.fetchEntitiesByPointers(EntityType.WEARABLE, wearableIds)
  return new Map(
    entities
      .filter((entity) => !!entity.metadata)
      .map((entity) => [entity.pointers[0], translateEntityIntoWearable(client, entity)])
  )
}
