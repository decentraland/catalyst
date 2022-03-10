import { Entity, EntityContentItemReference } from 'dcl-catalyst-commons'
import { EntityField } from './Controller'

export class ControllerEntityFactory {
  static maskEntity(fullEntity: Entity, fields?: EntityField[]): Entity {
    const { id, type, timestamp, version } = fullEntity
    let content: EntityContentItemReference[] | undefined = undefined
    let metadata: any
    let pointers: string[] = []
    if ((!fields || fields.includes(EntityField.CONTENT)) && fullEntity.content) {
      content = fullEntity.content
    }
    if (!fields || fields.includes(EntityField.METADATA)) {
      metadata = fullEntity.metadata
    }
    if ((!fields || fields.includes(EntityField.POINTERS)) && fullEntity.pointers) {
      pointers = fullEntity.pointers
    }
    return { version, id, type, timestamp, pointers, content, metadata }
  }
}
