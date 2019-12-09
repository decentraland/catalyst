import { FileHash } from "./Hashing"
import { Timestamp } from "./Service"

export class Entity {
    id: EntityId
    type: EntityType
    pointers: Set<Pointer>
    timestamp: Timestamp
    content?: Map<string, FileHash>
    metadata?: string    
}

export type Pointer = string
export type EntityId = FileHash

export enum EntityType {
    SCENE = "scene", 
    WEARABLE = "wearable",
    PROFILE = "profile",
}