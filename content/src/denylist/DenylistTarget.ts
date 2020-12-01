import { EthAddress } from "dcl-crypto";
import { ContentFileHash, EntityType, Pointer, EntityId } from "dcl-catalyst-commons";

export class DenylistTarget {
    private readonly id: DenylistTargetId;
    constructor(private readonly type: DenylistTargetType, id: DenylistTargetId) {
        this.id = id.toLowerCase()
    }

    asString(): string {
        return `${this.type}-${this.id}`
    }

    asObject(): { type: string, id: string } {
        return {
            type: this.type,
            id: this.id,
        }
    }

    getType() {
        return this.type
    }

    getId() {
        return this.id
    }
}

export function parseDenylistTargetString(string: string) {
    const split = string.split("-")
    const type = split.shift() as string
    const id = split.join("-")
    return parseDenylistTypeAndId(type, id)

}

export function parseDenylistTypeAndId(type: string, id: string) {
    for (const targetType of Object.values(DenylistTargetType)) {
        if (type === targetType) {
            return new DenylistTarget(DenylistTargetType[targetType.toUpperCase()], id)
        }
    }
    throw new Error(`Couldn't find a proper match for the given denylist target`);
}

export function buildAddressTarget(ethAddress: EthAddress) {
    return new DenylistTarget(DenylistTargetType.ADDRESS, ethAddress)
}

export function buildContentTarget(fileHash: ContentFileHash) {
    return new DenylistTarget(DenylistTargetType.CONTENT, fileHash)
}

export function buildPointerTarget(entityType: EntityType, pointer: Pointer) {
    return new DenylistTarget(DenylistTargetType.POINTER, combineWithEntityType(entityType, pointer))
}

export function buildEntityTarget(entityType: EntityType, entityId: EntityId) {
    return new DenylistTarget(DenylistTargetType.ENTITY, combineWithEntityType(entityType, entityId))
}

function combineWithEntityType(entityType: EntityType, other: string) {
    return `${entityType}-${other}`
}

export enum DenylistTargetType {
    ENTITY = "entity",
    POINTER = "pointer",
    CONTENT = "content",
    ADDRESS = "address",
}
export type DenylistTargetId = string