import { FileHash } from "./Hashing";
import { EntityType, Pointer, EntityId, Entity } from "./Entity";

export const ENTITY_FILE_NAME = 'entity.json';

export interface Service {
    
    getEntitiesByPointers(type: EntityType, pointers: Pointer[]): Promise<Entity[]>;

    getEntitiesByIds(type: EntityType, ids: EntityId[]): Promise<Entity[]>;

    getActivePointers(type: EntityType): Promise<Pointer[]>;

    deployEntity(files: Set<File>, entityId: EntityId, ethAddress: EthAddress, signature: Signature): Promise<Timestamp>;

    getAuditInfo(type: EntityType, id: EntityId): Promise<AuditInfo>;

    getHistory(from?: Timestamp, to?: Timestamp, type?: HistoryType): Promise<HistoryEvent[]>;

    isContentAvailable(fileHashes: FileHash[]): Promise<Map<FileHash, Boolean>>;

    getContent(fileHash: FileHash): Promise<Buffer>;

    // getContenetURL() //ToAvoid
}

export type HistoryEvent = {
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

export type File = {
    name: string
    content: Buffer
}

export type Timestamp = number
export type Signature = string
export type EthAddress = string

export enum HistoryType {
    DEPLOYMENT = "deployment",
    SNAPSHOT   = "snapshot",
}
