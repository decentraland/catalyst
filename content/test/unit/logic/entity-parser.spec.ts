import { Entity, EntityType } from '@dcl/schemas'
import { createEntityParser, IEntityParser, InvalidEntityError } from '../../../src/logic/entity-parser'
import { buildEntityAndFile, entityToFile } from '../../helpers/entity-tests-helper'

describe('when parsing an entity from a buffer', () => {
  let entityParser: IEntityParser
  let entity: Entity
  let entityFile: Uint8Array

  beforeEach(async () => {
    entityParser = createEntityParser()
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
      expect(entityParser.parse(entityFile, entity.id)).toEqual(entity)
    })
  })

  describe('and the entity file is not valid json', () => {
    it('should throw InvalidEntityError', () => {
      const invalidFile = Buffer.from('Hello')
      expect(() => entityParser.parse(invalidFile, 'id')).toThrow(InvalidEntityError)
      expect(() => entityParser.parse(invalidFile, 'id')).toThrow(
        'Failed to parse the entity file. Please make sure that it is a valid json.'
      )
    })
  })

  describe('and the entity type is not a known EntityType', () => {
    it('should throw InvalidEntityError listing the valid types', () => {
      const invalidEntity = copyEntity(entity)
      invalidEntity.type = 'invalidType'
      assertInvalidEntity(
        entityParser,
        invalidEntity,
        `Please set a valid type. It must be one of ${Object.values(EntityType)}. We got '${invalidEntity.type}'`
      )
    })
  })

  describe('and the pointers field is not an array', () => {
    it('should throw InvalidEntityError', () => {
      const invalidEntity = copyEntity(entity)
      invalidEntity.pointers = 'invalidPointers'
      assertInvalidEntity(entityParser, invalidEntity, 'Please set valid pointers')
    })
  })

  describe('and the pointers array contains non-string values', () => {
    it('should throw InvalidEntityError', () => {
      const invalidEntity = copyEntity(entity)
      invalidEntity.pointers = [1234]
      assertInvalidEntity(entityParser, invalidEntity, 'Please set valid pointers')
    })
  })

  describe('and the timestamp is not a number', () => {
    it('should throw InvalidEntityError', () => {
      const invalidEntity = copyEntity(entity)
      invalidEntity.timestamp = 'invalidTimestamp'
      assertInvalidEntity(entityParser, invalidEntity, `Please set a valid timestamp. We got ${invalidEntity.timestamp}`)
    })
  })

  describe('and the content field is not an array', () => {
    it('should throw InvalidEntityError', () => {
      const invalidEntity = copyEntity(entity)
      invalidEntity.content = 'invalidContent'
      assertInvalidEntity(entityParser, invalidEntity, 'Expected an array as content')
    })
  })

  describe('and a content item is missing its hash', () => {
    it('should throw InvalidEntityError', () => {
      const invalidEntity = copyEntity(entity)
      invalidEntity.content = [{ file: 'name' }]
      assertInvalidEntity(entityParser, invalidEntity, 'Content must contain a file name and a file hash')
    })
  })

  describe('and a content item is missing its file name', () => {
    it('should throw InvalidEntityError', () => {
      const invalidEntity = copyEntity(entity)
      invalidEntity.content = [{ hash: 'hash' }]
      assertInvalidEntity(entityParser, invalidEntity, 'Content must contain a file name and a file hash')
    })
  })

  describe('and a content item has a non-string file name', () => {
    it('should throw InvalidEntityError', () => {
      const invalidEntity = copyEntity(entity)
      invalidEntity.content = [{ file: 1234, hash: 'hash' }]
      assertInvalidEntity(
        entityParser,
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
        entityParser,
        invalidEntity,
        'Please make sure that all file names and a file hashes are valid strings'
      )
    })
  })
})

function copyEntity(entity: Entity): any {
  return Object.assign({}, entity)
}

function assertInvalidEntity(entityParser: IEntityParser, invalidEntity: Entity, errorMessage: string) {
  const file = entityToFile(invalidEntity)
  expect(() => entityParser.parse(file, invalidEntity.id)).toThrow(InvalidEntityError)
  expect(() => entityParser.parse(file, invalidEntity.id)).toThrow(errorMessage)
}
