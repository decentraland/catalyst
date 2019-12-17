import { FileHash } from "./Hashing";
import { EntityType, Pointer, EntityId, Entity } from "./Entity";
import { ServerName } from "./naming/Naming";

export const ENTITY_FILE_NAME = 'entity.json';

export interface Service {

    getEntitiesByPointers(type: EntityType, pointers: Pointer[]): Promise<Entity[]>;

    getEntitiesByIds(type: EntityType, ids: EntityId[]): Promise<Entity[]>;

    getActivePointers(type: EntityType): Promise<Pointer[]>;

    deployEntity(files: Set<File>, entityId: EntityId, ethAddress: EthAddress, signature: Signature): Promise<Timestamp>;

    deployEntityWithServerAndTimestamp(files: Set<File>, entityId: EntityId, ethAddress: EthAddress, signature: Signature, serverName: ServerName, timestampCalculator: () => Timestamp): Promise<Timestamp>;

    getAuditInfo(type: EntityType, id: EntityId): Promise<AuditInfo>;

    isContentAvailable(fileHashes: FileHash[]): Promise<Map<FileHash, Boolean>>;

    getContent(fileHash: FileHash): Promise<Buffer>;

    // getContenetURL() //ToAvoid
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


