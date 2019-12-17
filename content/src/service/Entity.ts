import { FileHash } from "./Hashing"
import { Timestamp } from "./Service"

export class Entity {
    id: EntityId
    type: EntityType
    pointers: Pointer[]
    timestamp: Timestamp
    content?: Map<string, FileHash>
    metadata?: any

    constructor(id: EntityId, type: EntityType, pointers: Pointer[], timestamp: Timestamp,
        content?: Map<string, FileHash>, metadata?: any) {
        this.id = id
        this.type = type
        this.pointers = pointers
        this.timestamp = timestamp
        this.content = content
        this.metadata = metadata
    }

    wasDeployedBefore(otherEntity: Entity): Boolean {
        return this.timestamp < otherEntity.timestamp ||
            (this.timestamp == otherEntity.timestamp && this.id < otherEntity.id)
    }
}

export type Pointer = string
export type EntityId = FileHash

export enum EntityType {
    SCENE = "scene",
    WEARABLE = "wearable",
    PROFILE = "profile",
}