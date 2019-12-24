import { FileHash } from "./Hashing"
import { Timestamp } from "./Service"

export class Entity {

    constructor(public id: EntityId, public readonly type: EntityType, public readonly pointers: Pointer[], public readonly timestamp: Timestamp,
        public readonly content?: Map<string, FileHash>, public readonly metadata?: any) { }

}

export type Pointer = string
export type EntityId = FileHash

export enum EntityType {
    SCENE = "scene",
    WEARABLE = "wearable",
    PROFILE = "profile",
}