import { Entity } from "../service/Entity"
import { EntityField, ControllerEntity } from "./Controller"

export class ControllerEntityFactory {
    static maskEntity(fullEntity: Entity, fields?: EntityField[]): ControllerEntity {
        let maskedEntity = new ControllerEntity()
        maskedEntity.id = fullEntity.id
        maskedEntity.type = fullEntity.type
        maskedEntity.timestamp = fullEntity.timestamp
        if ((!fields || fields.includes(EntityField.CONTENT)) && fullEntity.content) {
            maskedEntity.content = [...fullEntity.content]
        }
        if (!fields || fields.includes(EntityField.METADATA)) {
            maskedEntity.metadata = fullEntity.metadata
        }
        if ((!fields || fields.includes(EntityField.POINTERS)) && fullEntity.pointers) {
            maskedEntity.pointers = fullEntity.pointers
        }
        return maskedEntity
    }

}