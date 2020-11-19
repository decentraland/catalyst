import { ContentFileHash, ServerStatus, EntityType, EntityId, Timestamp, DeploymentFilters, PartialDeploymentHistory, ServerName, ServerAddress, LegacyPartialDeploymentHistory, AuditInfo } from "dcl-catalyst-commons";
import { ContentItem } from "../storage/ContentStorage";
import { FailureReason, FailedDeployment } from "./errors/FailedDeploymentsManager";
import { RepositoryTask, Repository } from "../storage/Repository";
import { Deployment, PartialDeploymentPointerChanges, PointerChangesFilters } from "./deployments/DeploymentManager";
import { Entity } from "./Entity";
import { ContentFile } from "../controller/Controller";

/**x
 * This version of the service can tell clients about the state of the Metaverse. It assumes that all deployments
 * were done directly to it, and it is not aware that the service lives inside a cluster.
 */
export interface MetaverseContentService {
    start(): Promise<void>;
    deployEntity(files: ContentFile[], entityId: EntityId, auditInfo: LocalDeploymentAuditInfo, origin: string, repository?: RepositoryTask | Repository): Promise<Timestamp>;
    deployLocalLegacy(files: ContentFile[], entityId: EntityId, auditInfo: LocalDeploymentAuditInfo, repository?: RepositoryTask | Repository): Promise<Timestamp>;
    deployToFix(files: ContentFile[], entityId: EntityId, auditInfo: LocalDeploymentAuditInfo, origin: string, repository?: RepositoryTask | Repository): Promise<Timestamp>;
    isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>>;
    getContent(fileHash: ContentFileHash): Promise<ContentItem | undefined>;
    deleteContent(fileHashes: ContentFileHash[]): Promise<void>;
    storeContent(fileHash: ContentFileHash, content: Buffer): Promise<void>;
    getStatus(): ServerStatus;
    getLegacyHistory(from?: Timestamp, to?: Timestamp, serverName?: ServerName, offset?: number, limit?: number): Promise<LegacyPartialDeploymentHistory>;
    getDeployments(filters?: DeploymentFilters, offset?: number, limit?: number, repository?: RepositoryTask | Repository): Promise<PartialDeploymentHistory<Deployment>>;
    getAllFailedDeployments(): Promise<FailedDeployment[]>;
    getPointerChanges(filters?: PointerChangesFilters, offset?: number, limit?: number, repository?: RepositoryTask | Repository): Promise<PartialDeploymentPointerChanges>;
    listenToDeployments(listener: DeploymentListener): void;
}

/**
 * This version of the service is aware of the fact that the content service lives inside a cluster,
 * and that deployments can also happen on other servers.
 */
export interface ClusterDeploymentsService {
    reportErrorDuringSync(entityType: EntityType, entityId: EntityId, originTimestamp: Timestamp, originServerUrl: ServerAddress, reason: FailureReason, errorDescription?: string): Promise<null>;
    deployEntityFromCluster(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfo): Promise<void>;
    deployOverwrittenEntityFromCluster(entityFile: ContentFile, entityId: EntityId, auditInfo: AuditInfo): Promise<void>;
    isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>>;
    areEntitiesAlreadyDeployed(entityIds: EntityId[]): Promise<Map<EntityId, boolean>>;
}

export type LocalDeploymentAuditInfo = Pick<AuditInfo, 'version'| 'authChain' | 'migrationData'>

export type DeploymentEvent = {
    entity: Entity,
    auditInfo: AuditInfo,
    origin: string,
}

export type DeploymentListener = (deployment: DeploymentEvent) => void | Promise<void>
