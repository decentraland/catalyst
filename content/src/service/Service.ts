import { FileHash } from "./Hashing";
import { EntityType, Pointer, EntityId, Entity } from "./Entity";
import { ServerName } from "./naming/NameKeeper";
import { AuditInfo } from "./audit/Audit";
import { EthAddress, Signature } from "./auth/Authenticator";

export const ENTITY_FILE_NAME = 'entity.json';

/**
 * This version of the service can tell clients about the state of the Metaverse. It assumes that all deployments
 * were done directly to it, and it is not aware that the service lives inside a cluster.
 */
export interface MetaverseContentService {
    getEntitiesByPointers(type: EntityType, pointers: Pointer[]): Promise<Entity[]>;
    getEntitiesByIds(type: EntityType, ids: EntityId[]): Promise<Entity[]>;
    getActivePointers(type: EntityType): Promise<Pointer[]>;
    deployEntity(files: File[], entityId: EntityId, ethAddress: EthAddress, signature: Signature): Promise<Timestamp>;
    getAuditInfo(type: EntityType, id: EntityId): Promise<AuditInfo>;
    isContentAvailable(fileHashes: FileHash[]): Promise<Map<FileHash, boolean>>;
    getContent(fileHash: FileHash): Promise<Buffer>;
    getStatus(): Promise<ServerStatus>;
}

/**
 * This version of the service is aware of the fact that the content service lives inside a cluster,
 * and that deployments can also happen on other servers.
 */
export interface ClusterDeploymentsService {
    deployEntityFromCluster(files: File[], entityId: EntityId, ethAddress: EthAddress, signature: Signature, serverName: ServerName, deploymentTimestamp: Timestamp): Promise<void>;
    deployOverwrittenEntityFromCluster(files: File[], entityId: EntityId, ethAddress: EthAddress, signature: Signature, serverName: ServerName, deploymentTimestamp: Timestamp): Promise<void>;
    isContentAvailable(fileHashes: FileHash[]): Promise<Map<FileHash, boolean>>;
}

/** This version of the service can keep track of the immutable time */
export interface TimeKeepingService {
    setImmutableTime(immutableTime: Timestamp): Promise<void>;
    getLastImmutableTime(): Timestamp;
}

export type File = {
    name: string
    content: Buffer
}

export type Timestamp = number

export type ServerVersion = string

export type ServerStatus = {
    name: ServerName
    version: ServerVersion
    currentTime: Timestamp
    lastImmutableTime: Timestamp
}


