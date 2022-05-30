import { DeploymentBuilder } from 'dcl-catalyst-client'
import { Entity, EntityType } from '@dcl/schemas'
import { random } from 'faker'
import { EntityFactory } from '../../../src/service/EntityFactory'

/** Builds an entity with the given params, and also the file what represents it */
export async function buildEntityAndFile(
  type: EntityType,
  pointers: string[],
  timestamp: number,
  content?: Map<string, string>,
  metadata?: any
): Promise<[Entity, Uint8Array]> {
  const newContent = Array.from((content ?? new Map()).entries()).map(([file, hash]) => ({ file, hash }))
  const { entity, entityFile } = await DeploymentBuilder.buildEntityAndFile({
    type,
    pointers,
    timestamp,
    content: newContent,
    metadata
  })
  return [EntityFactory.fromJsonObject(entity), entityFile]
}

/** Build a file with the given entity as the content */
export function entityToFile(entity: Entity): Buffer {
  const copy: any = Object.assign({}, entity)
  copy.content =
    !copy.content || !(copy.content instanceof Map)
      ? copy.content
      : Array.from(copy.content.entries()).map(([key, value]) => ({ file: key, hash: value }))
  delete copy.id
  return Buffer.from(JSON.stringify(copy))
}

export function randomEntity(type?: EntityType): Entity {
  return {
    version: 'v3',
    id: random.alphaNumeric(10),
    type: type ?? EntityType.PROFILE,
    pointers: [random.alphaNumeric(1)],
    timestamp: random.number(10),
    metadata: random.alphaNumeric(10),
    content: []
  }
}
