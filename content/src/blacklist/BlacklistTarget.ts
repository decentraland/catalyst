import { Pointer, EntityType, EntityId } from "../service/Entity";
import { ContentFileHash } from "../service/Hashing";
import { EthAddress } from "../service/auth/Authenticator";

export class BlacklistTarget {
    private readonly id: BlacklistTargetId;
    constructor(private readonly type: BlacklistTargetType, id: BlacklistTargetId) {
        this.id = id.toLocaleLowerCase()
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

export function parseBlacklistTargetString(string: string) {
    const split = string.split("-")
    const type = split.shift() as string
    const id = split.join("-")
    return parseBlacklistTypeAndId(type, id)

}

export function parseBlacklistTypeAndId(type: string, id: string) {
    for (const targetType of Object.values(BlacklistTargetType)) {
        if (type === targetType) {
            return new BlacklistTarget(BlacklistTargetType[targetType.toUpperCase()], id)
        }
    }
    throw new Error(`Couldn't find a proper match for the given blacklist target`);
}

export function buildAddressTarget(ethAddress: EthAddress) {
    return new BlacklistTarget(BlacklistTargetType.ADDRESS, ethAddress)
}

export function buildContentTarget(fileHash: ContentFileHash) {
    return new BlacklistTarget(BlacklistTargetType.CONTENT, fileHash)
}

export function buildPointerTarget(entityType: EntityType, pointer: Pointer) {
    return new BlacklistTarget(BlacklistTargetType.POINTER, combineWithEntityType(entityType, pointer))
}

export function buildEntityTarget(entityType: EntityType, entityId: EntityId) {
    return new BlacklistTarget(BlacklistTargetType.ENTITY, combineWithEntityType(entityType, entityId))
}

function combineWithEntityType(entityType: EntityType, other: string) {
    return `${entityType}-${other}`
}

enum BlacklistTargetType {
    ENTITY = "entity",
    POINTER = "pointer",
    CONTENT = "content",
    ADDRESS = "address",
}
type BlacklistTargetId = string