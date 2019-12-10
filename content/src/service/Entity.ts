import { FileHash } from "./Hashing"
import { Timestamp, File } from "./Service"

export class Entity {
    id: EntityId
    type: EntityType
    pointers: Pointer[]
    timestamp: Timestamp
    content?: [string, FileHash][]
    metadata?: string

    static fromFile(file: File, entityId: EntityId): Entity {
        let entity: Entity;
        try {
            const parsedObject = JSON.parse(file.content.toString());
            parsedObject.id = entityId
            entity = parsedObject
        } catch (ex) {
            throw new Error("Failed to parse the entity file. Please make sure thay it is a valid json.\n" + ex)
        }
        return entity
    }
}

export type Pointer = string
export type EntityId = FileHash

export enum EntityType {
    SCENE = "scene", 
    WEARABLE = "wearable",
    PROFILE = "profile",
}