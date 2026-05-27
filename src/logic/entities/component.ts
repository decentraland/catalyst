import { EntityContentItemReference } from '@dcl/hashing'
import {
  BodyShape,
  Emote,
  Entity,
  EntityType,
  I18N,
  StandardProps,
  Wearable,
  WearableRepresentation
} from '@dcl/schemas'
import { EnvironmentConfig } from '../../Environment'
import { AnyObject, AppComponents } from '../../types'
import { InvalidEntityError } from './errors'
import { Erc721Entity, IEntities } from './types'
import { findImageHash, findThumbnailHash } from './utils'

type ERC721StandardTrait = {
  trait_type: string
  value: string
}

type ItemData = {
  replaces?: any[]
  hides?: any[]
  tags: string[]
  representations: any[]
  category: any
}

const RARITIES_EMISSIONS = {
  common: 100000,
  uncommon: 10000,
  rare: 5000,
  epic: 1000,
  legendary: 100,
  mythic: 10,
  unique: 1
}

const textDecoder = new TextDecoder()

export function createEntities(components: Pick<AppComponents, 'env'>): IEntities {
  const { env } = components
  const baseUrl = env.getConfig<string>(EnvironmentConfig.CONTENT_SERVER_ADDRESS)

  return {
    parse(buffer: Uint8Array, id: string): Entity {
      const entityAsObject = getObjectEntityFromBuffer(buffer)
      validateObjectEntity(entityAsObject)
      return parseEntityFromObject(entityAsObject, id)
    },

    buildUrn(protocol: string, contract: string, option: string): string {
      const version = contract.startsWith('0x') ? 'v2' : 'v1'
      return `urn:decentraland:${protocol}:collections-${version}:${contract}:${option}`
    },

    formatERC721Entity(urn: string, entity: Entity, emission: string | undefined): Erc721Entity {
      const itemMetadata: (Wearable | Emote) & StandardProps = entity.metadata
      const name = preferEnglish(itemMetadata.i18n)
      const totalEmission = RARITIES_EMISSIONS[itemMetadata.rarity]
      const description = emission ? `DCL Wearable ${emission}/${totalEmission}` : ''

      const imageHash = findImageHash(entity)
      const thumbnailHash = findThumbnailHash(entity)
      const itemData: ItemData = getItemData(itemMetadata)
      const bodyShapeTraits = getBodyShapes(itemData.representations).reduce(
        (bodyShapes: ERC721StandardTrait[], bodyShape) => {
          bodyShapes.push({ trait_type: 'Body Shape', value: bodyShape })
          return bodyShapes
        },
        []
      )
      const tagTraits = itemData.tags.reduce((tags: ERC721StandardTrait[], tag) => {
        tags.push({ trait_type: 'Tag', value: tag })
        return tags
      }, [])

      return {
        id: urn,
        name,
        description,
        language: 'en-US',
        image: imageHash ? new URL(`contents/${imageHash}`, baseUrl).toString() : undefined,
        thumbnail: thumbnailHash ? new URL(`contents/${thumbnailHash}`, baseUrl).toString() : undefined,
        attributes: [
          { trait_type: 'Rarity', value: itemMetadata.rarity },
          { trait_type: 'Category', value: itemData.category },
          ...tagTraits,
          ...bodyShapeTraits
        ]
      }
    }
  }
}

function getObjectEntityFromBuffer(buffer: Uint8Array): AnyObject {
  try {
    return JSON.parse(textDecoder.decode(buffer))
  } catch (e) {
    throw new InvalidEntityError('Failed to parse the entity file. Please make sure that it is a valid json.')
  }
}

function parseContent(contents: any[]): EntityContentItemReference[] | undefined {
  if (!contents || contents.length === 0) return

  return contents.map(({ file, hash }) => {
    if (!file || !hash) {
      throw new InvalidEntityError('Content must contain a file name and a file hash')
    }

    if (
      !(typeof file === 'string' || file instanceof String) ||
      !(typeof hash === 'string' || hash instanceof String)
    ) {
      throw new InvalidEntityError('Please make sure that all file names and a file hashes are valid strings')
    }

    return { file: file as string, hash: hash as string }
  })
}

function parseEntityFromObject(entityAsObject: AnyObject, id: string): Entity {
  return {
    id,
    type: EntityType[(entityAsObject.type as string).toUpperCase().trim()],
    pointers: (entityAsObject.pointers as string[]).map((pointer: string) => pointer.toLowerCase()),
    content: parseContent(entityAsObject.content as Array<any>) || [],
    version: (entityAsObject.version as string) ?? 'v3',
    timestamp: entityAsObject.timestamp as number,
    metadata: entityAsObject.metadata
  }
}

function validateObjectEntity(entityAsObject: AnyObject): void {
  const { type, pointers, timestamp, content } = entityAsObject

  if (!type || !(Object.values(EntityType) as string[]).includes(type as string))
    throw new InvalidEntityError(
      `Please set a valid type. It must be one of ${Object.values(EntityType)}. We got '${type}'`
    )

  if (
    !pointers ||
    !Array.isArray(pointers) ||
    !pointers.every((pointer) => typeof pointer === 'string' || pointer instanceof String)
  )
    throw new InvalidEntityError('Please set valid pointers')

  if (!timestamp || typeof timestamp !== 'number')
    throw new InvalidEntityError(`Please set a valid timestamp. We got ${timestamp}`)

  if (!!content && !Array.isArray(content)) throw new InvalidEntityError('Expected an array as content')
}

/** Prioritize the english variant; otherwise return the first available. */
function preferEnglish(i18ns: I18N[]): string | undefined {
  const i18nInEnglish = i18ns.filter((i18n) => i18n.code.toLowerCase() === 'en')[0]
  return (i18nInEnglish ?? i18ns[0])?.text
}

function getBodyShapes(representations: WearableRepresentation[]) {
  const bodyShapes = new Set<string>()
  for (const representation of representations) {
    for (const bodyShape of representation.bodyShapes) {
      if (bodyShape === BodyShape[BodyShape.MALE]) {
        bodyShapes.add('BaseMale')
      } else if (bodyShape === BodyShape[BodyShape.FEMALE]) {
        bodyShapes.add('BaseFemale')
      }
    }
  }
  return Array.from(bodyShapes)
}

function getItemData(itemMetadata: Wearable | Emote): ItemData {
  return (itemMetadata as Emote).emoteDataADR74 ?? (itemMetadata as Wearable).data
}
