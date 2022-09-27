import { Emote, EmoteCategory, Entity, I18N, Wearable } from '@dcl/schemas'
import { parseUrn } from '@dcl/urn-resolver'
import { SmartContentClient } from '../../../src/utils/SmartContentClient'
import { LambdasEmote, LambdasWearable, WearableId } from './types'

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

export function translateEntityIntoWearable(client: SmartContentClient, entity: Entity): LambdasWearable | undefined {
  if (!entity.metadata?.data?.representations) {
    // HOTFIX: When getting emotes as wearables
    return undefined
  }
  const metadata: Wearable = entity.metadata
  const representations = metadata.data.representations.map((representation) =>
    mapRepresentation(representation, client, entity)
  )

  const externalImage = createExternalContentUrl(client, entity, metadata.image)
  const thumbnail = createExternalContentUrl(client, entity, metadata.thumbnail)!
  const image = externalImage ?? metadata.image
  return {
    ...metadata,
    thumbnail,
    image,
    data: {
      ...metadata.data,
      representations
    }
  }
}

export function translateEntityIntoEmote(client: SmartContentClient, entity: Entity): LambdasEmote {
  const metadata: Emote | Wearable = entity.metadata!
  const isNewEmote = 'emoteDataADR74' in metadata
  return isNewEmote
    ? translateEmoteIntoLambdasEmote(client, entity)
    : translateEmoteSavedAsWearableIntoLambdasEmote(client, entity)
}

function translateEmoteIntoLambdasEmote(client: SmartContentClient, entity: Entity): LambdasEmote {
  const metadata: Emote = entity.metadata!
  if (!('emoteDataADR74' in metadata)) {
    throw new Error('Error translating entity into Emote. Entity is not an Emote')
  }
  const representations = metadata.emoteDataADR74.representations.map((representation) =>
    mapRepresentation(representation, client, entity)
  )
  const externalImage = createExternalContentUrl(client, entity, metadata.image)
  const thumbnail = createExternalContentUrl(client, entity, metadata.thumbnail)!
  const image = externalImage ?? metadata.image
  return {
    ...metadata,
    thumbnail,
    image,
    emoteDataADR74: {
      ...metadata.emoteDataADR74,
      representations
    }
  }
}

function translateEmoteSavedAsWearableIntoLambdasEmote(client: SmartContentClient, entity: Entity): LambdasEmote {
  const metadata: Emote | Wearable = entity.metadata!
  if (!('data' in metadata)) {
    throw new Error('Error translating entity into Emote. Entity is not a Wearable')
  }
  const representationsWithUrl = metadata.data.representations.map((representation) =>
    mapRepresentation(representation, client, entity)
  )
  const externalImage = createExternalContentUrl(client, entity, metadata.image)
  const thumbnail = createExternalContentUrl(client, entity, metadata.thumbnail)!
  const image = externalImage ?? metadata.image
  const { data, emoteDataV0, ...restOfMetadata } = metadata as any
  return {
    ...restOfMetadata,
    thumbnail,
    image,
    emoteDataADR74: {
      category: EmoteCategory.DANCE,
      tags: metadata.data.tags,
      loop: 'emoteDataV0' in metadata ? (metadata as any).emoteDataV0.loop : false,
      representations: representationsWithUrl
    }
  }
}

function mapRepresentation<T>(
  metadataRepresentation: T & { contents: string[] },
  client: SmartContentClient,
  entity: Entity
): T & { contents: { key: string; url: string }[] } {
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
