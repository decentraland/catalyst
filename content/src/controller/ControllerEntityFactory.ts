import { Entity as ControllerEntity, EntityContentItemReference } from "dcl-catalyst-commons"
import { Entity } from "../service/Entity"
import { EntityField } from "./Controller"

export class ControllerEntityFactory {
    static maskEntity(fullEntity: Entity, fields?: EntityField[]): ControllerEntity {
        const { id, type, timestamp } = fullEntity
        let content: EntityContentItemReference[] | undefined = undefined
        let metadata: any
        let pointers: string[] = []
        if ((!fields || fields.includes(EntityField.CONTENT)) && fullEntity.content) {
            content = Array.from(fullEntity.content.entries())
                .map(([file, hash]) => ({ file, hash }))
        }
        if (!fields || fields.includes(EntityField.METADATA)) {
            metadata = fullEntity.metadata
        }
        if ((!fields || fields.includes(EntityField.POINTERS)) && fullEntity.pointers) {
            pointers = fullEntity.pointers
        }
        return { id, type, timestamp, pointers, content, metadata }
    }

}