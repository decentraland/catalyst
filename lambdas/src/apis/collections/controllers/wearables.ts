import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { TheGraphClient } from '@katalyst/lambdas/utils/TheGraphClient'
import { EntityType } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import { Request, Response } from 'express'
import { WearableMetadata } from '../types'
import { WearableId } from './collections'

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
): Promise<{ urn: WearableId; amount: number; definition?: WearableMetadata | undefined }[]> {
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

async function fetchDefinitions(
  wearableIds: WearableId[],
  client: SmartContentClient
): Promise<Map<string, WearableMetadata>> {
  const entities = await client.fetchEntitiesByPointers(EntityType.WEARABLE, wearableIds)
  return new Map(
    entities
      .filter((entity) => !!entity.metadata)
      .map((entity) => [entity.pointers[0], mapMetadataIntoWearable(entity.metadata)])
  )
}

function mapMetadataIntoWearable(metadata: WearableMetadata): Wearable {
  return metadata
}

// TODO: Update once we know what the metadata will look like
type Wearable = WearableMetadata
