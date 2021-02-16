import { parseUrn } from '@dcl/urn-resolver'
import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { Entity } from 'dcl-catalyst-commons'
import {
  I18N,
  Wearable,
  WearableId,
  WearableMetadata,
  WearableMetadataRepresentation,
  WearableRepresentation
} from './types'

/**
 * We are translating from the old id format into the new one.
 *
 */
export async function translateWearablesIdFormat(wearableId: WearableId): Promise<WearableId | undefined> {
  if (!wearableId.startsWith('dcl://')) {
    return wearableId
  }
  const parsed = await parseUrn(wearableId)
  return parsed?.uri?.toString()
}

export function isBaseAvatar(wearable: WearableId): boolean {
  return wearable.includes('base-avatars')
}

/** We will prioritize the text in english. If not present, then we will choose the first one */
export function preferEnglish(i18ns: I18N[]): string | undefined {
  const i18nInEnglish = i18ns.filter((i18n) => i18n.code.toLowerCase() === 'en')[0]
  return (i18nInEnglish ?? i18ns[0])?.text
}

export function translateEntityIntoWearable(client: SmartContentClient, entity: Entity): Wearable {
  const metadata: WearableMetadata = entity.metadata!
  const representations = metadata.data.representations.map((representation) =>
    mapRepresentation(representation, client, entity)
  )
  const image = createExternalContentUrl(client, entity, metadata.image)
  const thumbnail = createExternalContentUrl(client, entity, metadata.thumbnail)!

  return {
    ...metadata,
    image,
    thumbnail,
    data: {
      ...metadata.data,
      representations
    }
  }
}

function mapRepresentation(
  metadataRepresentation: WearableMetadataRepresentation,
  client: SmartContentClient,
  entity: Entity
): WearableRepresentation {
  const newContents = metadataRepresentation.contents.map((fileName) => ({
    key: fileName,
    url: createExternalContentUrl(client, entity, fileName)!
  }))
  return {
    ...metadataRepresentation,
    contents: newContents
  }
}

export function createExternalContentUrl(
  client: SmartContentClient,
  entity: Entity,
  fileName: string | undefined
): string | undefined {
  const hash = findHashForFile(entity, fileName)
  if (hash) {
    return client.getExternalContentServerUrl() + `/contents/` + hash
  }
  return undefined
}

export function findHashForFile(entity: Entity, fileName: string | undefined) {
  if (fileName) {
    return entity.content?.find((item) => item.file === fileName)?.hash
  }
}
