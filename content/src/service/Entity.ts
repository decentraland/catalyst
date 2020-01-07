import { ContentFileHash } from "./Hashing"
import { Timestamp } from "./Service"

export class Entity {

    constructor(public readonly id: EntityId, public readonly type: EntityType, public readonly pointers: Pointer[], public readonly timestamp: Timestamp,
        public readonly content?: Map<string, ContentFileHash>, public readonly metadata?: any) { }

}

export type Pointer = string
export type EntityId = ContentFileHash

export enum EntityType {
    SCENE = "scene",
    WEARABLE = "wearable",
    PROFILE = "profile",
}