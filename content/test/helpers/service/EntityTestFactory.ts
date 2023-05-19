import { Entity, EntityType } from '@dcl/schemas'
import { random } from 'faker'
/** Build a file with the given entity as the content */
export function entityToFile(entity: Entity): Buffer {
  const copy: any = Object.assign({}, entity)
  copy.content =
    !copy.content || !(copy.content instanceof Map)
      ? copy.content
      : (Array.from(copy.content.entries()) as any).map(([key, value]) => ({ file: key, hash: value }))
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
