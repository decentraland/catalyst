import { FileHash } from "./Hashing";
import { EntityType, Pointer, EntityId, Entity } from "./Entity";
import { ServerName } from "./naming/NameKeeper";

export const ENTITY_FILE_NAME = 'entity.json';

export interface Service {

    getEntitiesByPointers(type: EntityType, pointers: Pointer[]): Promise<Entity[]>;

    getEntitiesByIds(type: EntityType, ids: EntityId[]): Promise<Entity[]>;

    getActivePointers(type: EntityType): Promise<Pointer[]>;

    deployEntity(files: Set<File>, entityId: EntityId, ethAddress: EthAddress, signature: Signature): Promise<Timestamp>;

    deployEntityFromAnotherContentServer(files: Set<File>, entityId: EntityId, ethAddress: EthAddress, signature: Signature, serverName: ServerName, deploymentTimestamp: Timestamp): Promise<void>;

    getAuditInfo(type: EntityType, id: EntityId): Promise<AuditInfo>;

    isContentAvailable(fileHashes: FileHash[]): Promise<Map<FileHash, Boolean>>;

    getContent(fileHash: FileHash): Promise<Buffer>;

    // getContenetURL() // TODO: This endpoint can be used to perform a redirect when the entity is not stored locally

    getStatus(): Promise<ServerStatus>;
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

export type ServerVersion = string

export type ServerStatus = {
    name: ServerName
    version: ServerVersion
    currentTime: Timestamp
}


