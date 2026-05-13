import { Entity, EntityType } from '@dcl/schemas'
import { Environment, EnvironmentConfig } from '../../../../src/Environment'
import { createEntities, IEntities, InvalidEntityError } from '../../../../src/logic/entities'
import { buildEntityAndFile, entityToFile } from '../../../helpers/entity-tests-helper'

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

describe('when parsing an entity from a buffer', () => {
  let entities: IEntities
  let entity: Entity
  let entityFile: Uint8Array

  beforeEach(async () => {
    entities = createEntities({ env: buildEnv() })
    ;[entity, entityFile] = await buildEntityAndFile(
      EntityType.SCENE,
      ['X1,Y1'],
      123456,
      new Map([['name', 'bafkreico6luxnkk5vxuxvmpsg7hva4upamyz3br2b6ucc7rf3hdlcaehha']]),
      { metadata: 'metadata' }
    )
  })

  describe('and the entity file is a valid serialized entity', () => {
    it('should return the parsed entity unchanged', () => {
      expect(entities.parse(entityFile, entity.id)).toEqual(entity)
    })
  })

  describe('and the entity file is not valid json', () => {
    it('should throw InvalidEntityError', () => {
      const invalidFile = Buffer.from('Hello')
      expect(() => entities.parse(invalidFile, 'id')).toThrow(InvalidEntityError)
      expect(() => entities.parse(invalidFile, 'id')).toThrow(
        'Failed to parse the entity file. Please make sure that it is a valid json.'
      )
    })
  })

  describe('and the entity type is not a known EntityType', () => {
    it('should throw InvalidEntityError listing the valid types', () => {
      const invalidEntity = copyEntity(entity)
      invalidEntity.type = 'invalidType'
      assertInvalidEntity(
        entities,
        invalidEntity,
        `Please set a valid type. It must be one of ${Object.values(EntityType)}. We got '${invalidEntity.type}'`
      )
    })
  })

  describe('and the pointers field is not an array', () => {
    it('should throw InvalidEntityError', () => {
      const invalidEntity = copyEntity(entity)
      invalidEntity.pointers = 'invalidPointers'
      assertInvalidEntity(entities, invalidEntity, 'Please set valid pointers')
    })
  })

  describe('and the pointers array contains non-string values', () => {
    it('should throw InvalidEntityError', () => {
      const invalidEntity = copyEntity(entity)
      invalidEntity.pointers = [1234]
      assertInvalidEntity(entities, invalidEntity, 'Please set valid pointers')
    })
  })

  describe('and the timestamp is not a number', () => {
    it('should throw InvalidEntityError', () => {
      const invalidEntity = copyEntity(entity)
      invalidEntity.timestamp = 'invalidTimestamp'
      assertInvalidEntity(entities, invalidEntity, `Please set a valid timestamp. We got ${invalidEntity.timestamp}`)
    })
  })

  describe('and the content field is not an array', () => {
    it('should throw InvalidEntityError', () => {
      const invalidEntity = copyEntity(entity)
      invalidEntity.content = 'invalidContent'
      assertInvalidEntity(entities, invalidEntity, 'Expected an array as content')
    })
  })

  describe('and a content item is missing its hash', () => {
    it('should throw InvalidEntityError', () => {
      const invalidEntity = copyEntity(entity)
      invalidEntity.content = [{ file: 'name' }]
      assertInvalidEntity(entities, invalidEntity, 'Content must contain a file name and a file hash')
    })
  })

  describe('and a content item is missing its file name', () => {
    it('should throw InvalidEntityError', () => {
      const invalidEntity = copyEntity(entity)
      invalidEntity.content = [{ hash: 'hash' }]
      assertInvalidEntity(entities, invalidEntity, 'Content must contain a file name and a file hash')
    })
  })

  describe('and a content item has a non-string file name', () => {
    it('should throw InvalidEntityError', () => {
      const invalidEntity = copyEntity(entity)
      invalidEntity.content = [{ file: 1234, hash: 'hash' }]
      assertInvalidEntity(
        entities,
        invalidEntity,
        'Please make sure that all file names and a file hashes are valid strings'
      )
    })
  })

  describe('and a content item has a non-string hash', () => {
    it('should throw InvalidEntityError', () => {
      const invalidEntity = copyEntity(entity)
      invalidEntity.content = [{ file: 'name', hash: 1234 }]
      assertInvalidEntity(
        entities,
        invalidEntity,
        'Please make sure that all file names and a file hashes are valid strings'
      )
    })
  })
})

describe('when building a wearable URN via buildUrn', () => {
  let entities: IEntities

  beforeEach(() => {
    entities = createEntities({ env: buildEnv() })
  })

  describe('and the contract address is hex-prefixed', () => {
    it('should produce a collections-v2 URN', () => {
      expect(entities.buildUrn('ethereum', '0xdeadbeef', '0')).toBe(
        'urn:decentraland:ethereum:collections-v2:0xdeadbeef:0'
      )
    })
  })

  describe('and the contract address is not hex-prefixed', () => {
    it('should produce a collections-v1 URN', () => {
      expect(entities.buildUrn('ethereum', 'halloween_2019', '0')).toBe(
        'urn:decentraland:ethereum:collections-v1:halloween_2019:0'
      )
    })
  })
})

describe('when formatting an ERC-721 entity', () => {
  let entities: IEntities
  let entity: Entity

  beforeEach(() => {
    entities = createEntities({ env: buildEnv() })
    entity = buildWearableEntity()
  })

  describe('and the entity has english and non-english i18n entries', () => {
    it('should pick the english name', () => {
      const result = entities.formatERC721Entity('urn:demo', entity, undefined)
      expect(result.name).toBe('Cool Hat')
    })
  })

  describe('and the entity has an image and a thumbnail', () => {
    it('should build absolute content URLs using the configured content server address', () => {
      const result = entities.formatERC721Entity('urn:demo', entity, undefined)
      expect(result.image).toBe(`${BASE_URL}contents/bafkrei-image`)
      expect(result.thumbnail).toBe(`${BASE_URL}contents/bafkrei-thumb`)
    })
  })

  describe('and an emission count is provided', () => {
    it('should include "DCL Wearable {emission}/{totalForRarity}" in the description', () => {
      const result = entities.formatERC721Entity('urn:demo', entity, '42')
      expect(result.description).toBe('DCL Wearable 42/5000')
    })
  })

  describe('and no emission count is provided', () => {
    it('should leave the description empty', () => {
      const result = entities.formatERC721Entity('urn:demo', entity, undefined)
      expect(result.description).toBe('')
    })
  })

  describe('and the entity declares tag metadata', () => {
    it('should emit a Tag attribute for each declared tag', () => {
      const result = entities.formatERC721Entity('urn:demo', entity, undefined)
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
      const result = entities.formatERC721Entity('urn:demo', noImageEntity, undefined)
      expect(result.image).toBeUndefined()
      expect(result.thumbnail).toBeUndefined()
    })
  })
})

function copyEntity(entity: Entity): any {
  return Object.assign({}, entity)
}

function assertInvalidEntity(entities: IEntities, invalidEntity: Entity, errorMessage: string) {
  const file = entityToFile(invalidEntity)
  expect(() => entities.parse(file, invalidEntity.id)).toThrow(InvalidEntityError)
  expect(() => entities.parse(file, invalidEntity.id)).toThrow(errorMessage)
}
