import { Entity, EntityType } from '@dcl/schemas'
import { getEntityFromBuffer } from '../../../src/logic/entity-parser'
import { buildEntityAndFile, entityToFile } from '../../helpers/entity-tests-helper'

describe('Service', () => {
  let entity: Entity
  let entityFile: Uint8Array

  beforeAll(async () => {
    ;[entity, entityFile] = await buildEntityAndFile(
      EntityType.SCENE,
      ['X1,Y1'],
      123456,
      new Map([['name', 'bafkreico6luxnkk5vxuxvmpsg7hva4upamyz3br2b6ucc7rf3hdlcaehha']]),
      { metadata: 'metadata' }
    )
  })

  it(`When a valid entity file is used, then it is parsed correctly`, () => {
    expect(getEntityFromBuffer(entityFile, entity.id)).toEqual(entity)
  })

  it(`When the entity file can't be parsed into an entity, then an exception is thrown`, () => {
    const invalidFile = Buffer.from('Hello')

    assertInvalidFile(invalidFile, `id`, `Failed to parse the entity file. Please make sure that it is a valid json.`)
  })

  it(`When type is not valid, then an exceptions is thrown`, () => {
    const invalidEntity = copyEntity(entity)
    invalidEntity.type = 'invalidType'

    assertInvalidEntity(
      invalidEntity,
      `Please set a valid type. It must be one of ${Object.values(EntityType)}. We got '${invalidEntity.type}'`
    )
  })

  it(`When pointers aren't an array, then an exceptions is thrown`, () => {
    const invalidEntity = copyEntity(entity)
    invalidEntity.pointers = 'invalidPointers'

    assertInvalidEntity(invalidEntity, `Please set valid pointers`)
  })

  it(`When pointers are an array, but with strings, then an exceptions is thrown`, () => {
    const invalidEntity = copyEntity(entity)
    invalidEntity.pointers = [1234]

    assertInvalidEntity(invalidEntity, `Please set valid pointers`)
  })

  it(`When timestamp is not valid, then an exceptions is thrown`, () => {
    const invalidEntity = copyEntity(entity)
    invalidEntity.timestamp = 'invalidTimestamp'

    assertInvalidEntity(invalidEntity, `Please set a valid timestamp. We got ${invalidEntity.timestamp}`)
  })

  it(`When content is not an array, then an exceptions is thrown`, () => {
    const invalidEntity = copyEntity(entity)
    invalidEntity.content = 'invalidContent'

    assertInvalidEntity(invalidEntity, `Expected an array as content`)
  })

  it(`When content does not have a hash, then an exceptions is thrown`, () => {
    const invalidEntity = copyEntity(entity)
    invalidEntity.content = [{ file: 'name' }]

    assertInvalidEntity(invalidEntity, `Content must contain a file name and a file hash`)
  })

  it(`When content does not have a file, then an exceptions is thrown`, () => {
    const invalidEntity = copyEntity(entity)
    invalidEntity.content = [{ hash: 'hash' }]

    assertInvalidEntity(invalidEntity, `Content must contain a file name and a file hash`)
  })

  it(`When content file is not a string, then an exceptions is thrown`, () => {
    const invalidEntity = copyEntity(entity)
    invalidEntity.content = [{ file: 1234, hash: 'hash' }]

    assertInvalidEntity(invalidEntity, `Please make sure that all file names and a file hashes are valid strings`)
  })

  it(`When content hash is not a string, then an exceptions is thrown`, () => {
    const invalidEntity = copyEntity(entity)
    invalidEntity.content = [{ file: 'name', hash: 1234 }]

    assertInvalidEntity(invalidEntity, `Please make sure that all file names and a file hashes are valid strings`)
  })

  function copyEntity(entity: Entity): any {
    return Object.assign({}, entity)
  }

  function assertInvalidEntity(invalidEntity: Entity, errorMessage: string) {
    assertInvalidFile(entityToFile(invalidEntity), invalidEntity.id, errorMessage)
  }

  function assertInvalidFile(file: Buffer, entityId: string, errorMessage: string) {
    expect(() => {
      getEntityFromBuffer(file, entityId)
    }).toThrowError(errorMessage)
  }
})
