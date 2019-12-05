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
        return Promise.resolve(new AuditInfo())
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

export class HistoryEvent {
    timestamp: Timestamp
}

export class DeploymentEvent extends HistoryEvent {
    entityType: EntityType
    entityId: EntityId
}

export class SnapshotEvent extends HistoryEvent {
    activeEntities: Map<EntityType, Map<Pointer, EntityId>>
    deltaEventsHash: FileHash
    previousSnapshotTimestamp: Timestamp
}

export class AuditInfo {
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

type EthAddress = string
type Timestamp = number
type Signature = string
type FileHash = string
type Pointer = string
type EntityId = FileHash

enum HistoryType {
    DEPLOYMENT,
    SNAPSHOT,
}

enum EntityType {
    SCENE, 
    WEARABLE,
    PROFILE,
}