import { Entity, EntityType } from '@dcl/schemas'
import { Environment, EnvironmentConfig } from '../../../../src/Environment'
import { createErc721, IErc721 } from '../../../../src/logic/erc721'

const BASE_URL = 'https://content.example.test/'

function buildEnv(): Environment {
  const env = new Environment()
  env.setConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS, BASE_URL)
  return env
}

function buildWearableEntity(overrides: { image?: string; thumbnail?: string; content?: Entity['content'] } = {}): Entity {
  return {
    id: 'bafkrei000',
    type: EntityType.WEARABLE,
    pointers: ['0x000'],
    timestamp: 1,
    content: overrides.content ?? [
      { file: 'image.png', hash: 'bafkrei-image' },
      { file: 'thumbnail.png', hash: 'bafkrei-thumb' }
    ],
    version: 'v3',
    metadata: {
      id: 'urn',
      i18n: [{ code: 'en', text: 'Cool Hat' }, { code: 'es', text: 'Gorro Cool' }],
      rarity: 'rare',
      image: overrides.image ?? 'image.png',
      thumbnail: overrides.thumbnail ?? 'thumbnail.png',
      data: {
        tags: ['style:funny'],
        representations: [{ bodyShapes: ['urn:decentraland:off-chain:base-avatars:BaseMale'] }],
        category: 'hat'
      }
    } as any
  }
}

describe('when building a wearable URN via buildUrn', () => {
  let erc721: IErc721

  beforeEach(() => {
    erc721 = createErc721({ env: buildEnv() })
  })

  describe('and the contract address is hex-prefixed', () => {
    it('should produce a collections-v2 URN', () => {
      expect(erc721.buildUrn('ethereum', '0xdeadbeef', '0')).toBe(
        'urn:decentraland:ethereum:collections-v2:0xdeadbeef:0'
      )
    })
  })

  describe('and the contract address is not hex-prefixed', () => {
    it('should produce a collections-v1 URN', () => {
      expect(erc721.buildUrn('ethereum', 'halloween_2019', '0')).toBe(
        'urn:decentraland:ethereum:collections-v1:halloween_2019:0'
      )
    })
  })
})

describe('when formatting an ERC-721 entity', () => {
  let erc721: IErc721
  let entity: Entity

  beforeEach(() => {
    erc721 = createErc721({ env: buildEnv() })
    entity = buildWearableEntity()
  })

  describe('and the entity has english and non-english i18n entries', () => {
    it('should pick the english name', () => {
      const result = erc721.formatERC721Entity('urn:demo', entity, undefined)
      expect(result.name).toBe('Cool Hat')
    })
  })

  describe('and the entity has an image and a thumbnail', () => {
    it('should build absolute content URLs using the configured content server address', () => {
      const result = erc721.formatERC721Entity('urn:demo', entity, undefined)
      expect(result.image).toBe(`${BASE_URL}contents/bafkrei-image`)
      expect(result.thumbnail).toBe(`${BASE_URL}contents/bafkrei-thumb`)
    })
  })

  describe('and an emission count is provided', () => {
    it('should include "DCL Wearable {emission}/{totalForRarity}" in the description', () => {
      const result = erc721.formatERC721Entity('urn:demo', entity, '42')
      expect(result.description).toBe('DCL Wearable 42/5000')
    })
  })

  describe('and no emission count is provided', () => {
    it('should leave the description empty', () => {
      const result = erc721.formatERC721Entity('urn:demo', entity, undefined)
      expect(result.description).toBe('')
    })
  })

  describe('and the entity declares tag metadata', () => {
    it('should emit a Tag attribute for each declared tag', () => {
      const result = erc721.formatERC721Entity('urn:demo', entity, undefined)
      expect(result.attributes).toEqual(
        expect.arrayContaining([{ trait_type: 'Tag', value: 'style:funny' }])
      )
    })
  })

describe('and the entity has no image/thumbnail metadata', () => {
    it('should leave the image and thumbnail fields undefined', () => {
      const noImageEntity: Entity = {
        ...entity,
        metadata: { ...(entity.metadata as any), image: undefined, thumbnail: undefined }
      }
      const result = erc721.formatERC721Entity('urn:demo', noImageEntity, undefined)
      expect(result.image).toBeUndefined()
      expect(result.thumbnail).toBeUndefined()
    })
  })
})
