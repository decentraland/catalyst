import { ContentFileHash } from "./Hashing";
import { EntityType, Pointer, EntityId, Entity } from "./Entity";
import { ServerName } from "./naming/NameKeeper";
import { AuditInfo } from "./audit/Audit";
import { Timestamp } from "./time/TimeSorting";
import { ContentItem } from "../storage/ContentStorage";
import { FailureReason } from "./errors/FailedDeploymentsManager";

export const ENTITY_FILE_NAME = 'entity.json';

/**
 * This version of the service can tell clients about the state of the Metaverse. It assumes that all deployments
 * were done directly to it, and it is not aware that the service lives inside a cluster.
 */
export interface MetaverseContentService {
    getEntitiesByPointers(type: EntityType, pointers: Pointer[]): Promise<Entity[]>;
    getEntitiesByIds(type: EntityType, ids: EntityId[]): Promise<Entity[]>;
    getActivePointers(type: EntityType): Promise<Pointer[]>;
    deployEntity(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfo, origin: string): Promise<Timestamp>;
    deployToFix(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfo, origin: string): Promise<Timestamp>;
    getAuditInfo(type: EntityType, id: EntityId): Promise<AuditInfo | undefined>;
    isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>>;
    getContent(fileHash: ContentFileHash): Promise<ContentItem | undefined>;
    getStatus(): Promise<ServerStatus>;
}

/**
 * This version of the service is aware of the fact that the content service lives inside a cluster,
 * and that deployments can also happen on other servers.
 */
export interface ClusterDeploymentsService {
    reportErrorDuringSync(failureReason: FailureReason, entityType: EntityType, entityId: EntityId, deploymentTimestamp: Timestamp, serverName: ServerName): Promise<void>;
    deployEntityFromCluster(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfo, serverName: ServerName): Promise<void>;
    deployOverwrittenEntityFromCluster(entityFile: ContentFile, entityId: EntityId, auditInfo: AuditInfo, serverName: ServerName): Promise<void>;
    isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>>;
}

/** This version of the service can keep track of the immutable time */
export interface TimeKeepingService {
    setImmutableTime(immutableTime: Timestamp): Promise<void>;
    getLastImmutableTime(): Timestamp;
}

export type ContentFile = {
    name: string
    content: Buffer
}

export type ServerVersion = string

export type ServerStatus = {
    name: ServerName
    version: ServerVersion
    currentTime: Timestamp
    lastImmutableTime: Timestamp
    historySize: number
    commitHash: string
}


