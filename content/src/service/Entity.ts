import { ContentFileHash, EntityId, EntityType, Pointer, Timestamp } from "dcl-catalyst-commons"

export class Entity {

    constructor(public readonly id: EntityId, public readonly type: EntityType, public readonly pointers: Pointer[], public readonly timestamp: Timestamp,
        public readonly content?: Map<string, ContentFileHash>, public readonly metadata?: any) { }

}