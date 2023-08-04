import { I18N, BodyShape, Emote, StandardProps, Wearable, WearableRepresentation, Entity } from '@dcl/schemas'
import { Environment, EnvironmentConfig } from '../Environment.js'
import { findImageHash, findThumbnailHash } from './entities.js'

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

export function buildUrn(protocol: string, contract: string, option: string): string {
  const version = contract.startsWith('0x') ? 'v2' : 'v1'
  return `urn:decentraland:${protocol}:collections-${version}:${contract}:${option}`
}

/** We will prioritize the text in english. If not present, then we will choose the first one */
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

export function formatERC21Entity(env: Environment, urn: string, entity: Entity, emission: string | undefined) {
  const baseUrl = env.getConfig<string>(EnvironmentConfig.CONTENT_SERVER_ADDRESS)

  const itemMetadata: (Wearable | Emote) & StandardProps = entity.metadata
  const name = preferEnglish(itemMetadata.i18n)
  const totalEmission = RARITIES_EMISSIONS[itemMetadata.rarity]
  const description = emission ? `DCL Wearable ${emission}/${totalEmission}` : ''

  const imageHash = findImageHash(entity)
  const thumbnailHash = findThumbnailHash(entity)
  const itemData: ItemData = (itemMetadata as Emote).emoteDataADR74 ?? (itemMetadata as Wearable).data
  const bodyShapeTraits = getBodyShapes(itemData.representations).reduce(
    (bodyShapes: ERC721StandardTrait[], bodyShape) => {
      bodyShapes.push({
        trait_type: 'Body Shape',
        value: bodyShape
      })
      return bodyShapes
    },
    []
  )
  const tagTraits = itemData.tags.reduce((tags: ERC721StandardTrait[], tag) => {
    tags.push({
      trait_type: 'Tag',
      value: tag
    })
    return tags
  }, [])

  return {
    id: urn,
    name,
    description,
    language: 'en-US',
    image: imageHash ? baseUrl + `contents/` + imageHash : undefined,
    thumbnail: thumbnailHash ? baseUrl + `contents/` + thumbnailHash : undefined,
    attributes: [
      {
        trait_type: 'Rarity',
        value: itemMetadata.rarity
      },
      {
        trait_type: 'Category',
        value: itemData.category
      },
      ...tagTraits,
      ...bodyShapeTraits
    ]
  }
}
