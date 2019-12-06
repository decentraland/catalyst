export class Service {
    
    
    getEntitiesByPointers(type: EntityType, ids: Pointer[]): Promise<Entity[]> {
        return Promise.resolve([])
    }

    getEntitiesByIds(type: EntityType, ids: EntityId[]): Promise<Entity[]> {
        return Promise.resolve([])
    }

    getActivePointers(type: EntityType): Promise<Pointer[]> {
        return Promise.resolve([])
    }

    deployEntity(files: Set<File>, entityId: EntityId, ethAddress: EthAddress, signature: Signature): Promise<Timestamp> {
        // We could force clients to set the name "entity.json" to the entity file, or we could simply find the file that hashes to entityId
        return Promise.resolve(0)
    }

    getAuditInfo(type: EntityType, id: EntityId): Promise<AuditInfo> {
        return Promise.resolve({
            deployedTimestamp: 1,
            ethAddress: "",
            signature: ""
        })
    }

    getHistory(from?: Timestamp, to?: Timestamp, type?: HistoryType): Promise<HistoryEvent[]> {
        return Promise.resolve([])
    }

    isContentAvailable(fileHashes: FileHash[]): Promise<Map<FileHash, Boolean>> {
        return Promise.resolve(new Map())
    }

    // getContent() // TODO
    // getContenetURL() //ToAvoid

}

type HistoryEvent = {
    timestamp: Timestamp
}

export type DeploymentEvent = HistoryEvent & {
    entityType: EntityType
    entityId: EntityId
}

export type SnapshotEvent = HistoryEvent & {
    activeEntities: Map<EntityType, Map<Pointer, EntityId>>
    deltaEventsHash: FileHash
    previousSnapshotTimestamp: Timestamp
}

export type AuditInfo = {
    deployedTimestamp: Timestamp    
    ethAddress: EthAddress
    signature: Signature    
}

export class Entity {
    type: EntityType
    content: Map<string, FileHash>
    metadata: string
    pointers: Pointer[]
    timestamp: Timestamp
}

export type EthAddress = string
export type Timestamp = number
export type Signature = string
export type FileHash = string
export type Pointer = string
export type EntityId = FileHash

export enum HistoryType {
    DEPLOYMENT,
    SNAPSHOT,
}

export enum EntityType {
    SCENE, 
    WEARABLE,
    PROFILE,
}