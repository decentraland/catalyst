import { ContentFileHash } from "./Hashing";
import { EntityType, Pointer, EntityId, Entity } from "./Entity";
import { ServerName } from "./naming/NameKeeper";
import { AuditInfo, AuditInfoExternal, AuditInfoBase } from "./Audit";
import { Timestamp } from "./time/TimeSorting";
import { ContentItem } from "../storage/ContentStorage";
import { FailureReason, FailedDeployment } from "./errors/FailedDeploymentsManager";
import { ServerAddress } from "./synchronization/clients/contentserver/ContentServerClient";
import { PartialDeploymentLegacyHistory } from "./history/HistoryManager";
import { RepositoryTask, Repository } from "../storage/Repository";

export const ENTITY_FILE_NAME = 'entity.json';

/**
 * This version of the service can tell clients about the state of the Metaverse. It assumes that all deployments
 * were done directly to it, and it is not aware that the service lives inside a cluster.
 */
export interface MetaverseContentService {
    getEntitiesByPointers(type: EntityType, pointers: Pointer[], repository?: RepositoryTask | Repository): Promise<Entity[]>;
    getEntitiesByIds(type: EntityType, ids: EntityId[], repository?: RepositoryTask | Repository): Promise<Entity[]>;
    deployEntity(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfoBase, origin: string, repository?: RepositoryTask | Repository): Promise<Timestamp>;
    deployLegacy(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfoBase, repository?: RepositoryTask | Repository): Promise<Timestamp>;
    deployToFix(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfoBase, origin: string, repository?: RepositoryTask | Repository): Promise<Timestamp>;
    getAuditInfo(type: EntityType, id: EntityId, repository?: RepositoryTask | Repository): Promise<AuditInfo | undefined>;
    isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>>;
    getContent(fileHash: ContentFileHash): Promise<ContentItem | undefined>;
    getStatus(): ServerStatus;
    getLegacyHistory(from?: Timestamp, to?: Timestamp, serverName?: ServerName, offset?: number, limit?: number): Promise<PartialDeploymentLegacyHistory>;
    getAllFailedDeployments(): Promise<FailedDeployment[]>;
}

/**
 * This version of the service is aware of the fact that the content service lives inside a cluster,
 * and that deployments can also happen on other servers.
 */
export interface ClusterDeploymentsService {
    reportErrorDuringSync(entityType: EntityType, entityId: EntityId, originTimestamp: Timestamp, originServerUrl: ServerAddress, reason: FailureReason, errorDescription?: string): Promise<null>;
    deployEntityFromCluster(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfoExternal): Promise<void>;
    deployOverwrittenEntityFromCluster(entityFile: ContentFile, entityId: EntityId, auditInfo: AuditInfoExternal): Promise<void>;
    isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>>;
    areEntitiesAlreadyDeployed(entityIds: EntityId[]): Promise<Map<EntityId, boolean>>;
}

/** This version of the service can keep track of the immutable time */
export interface TimeKeepingService {
    setImmutableTime(immutableTime: Timestamp): void;
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
}


