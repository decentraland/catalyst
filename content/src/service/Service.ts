import {
  AuditInfo,
  ContentFileHash,
  EntityId,
  EntityType,
  PartialDeploymentHistory,
  Pointer,
  ServerStatus,
  Timestamp
} from 'dcl-catalyst-commons'
import { ContentFile } from '../controller/Controller'
import { Database } from '../repository/Database'
import { ContentItem } from '../storage/ContentStorage'
import {
  Deployment,
  DeploymentOptions,
  PartialDeploymentPointerChanges,
  PointerChangesFilters
} from './deployments/DeploymentManager'
import { Entity } from './Entity'
import { FailedDeployment, FailureReason } from './errors/FailedDeploymentsManager'

/**x
 * This version of the service can tell clients about the state of the Metaverse. It assumes that all deployments
 * were done directly to it, and it is not aware that the service lives inside a cluster.
 */
export interface MetaverseContentService {
  start(): Promise<void>
  deployEntity(
    files: ContentFile[],
    entityId: EntityId,
    auditInfo: LocalDeploymentAuditInfo,
    origin: string,
    task?: Database
  ): Promise<DeploymentResult>
  deployLocalLegacy(
    files: ContentFile[],
    entityId: EntityId,
    auditInfo: LocalDeploymentAuditInfo,
    task?: Database
  ): Promise<DeploymentResult>
  deployToFix(
    files: ContentFile[],
    entityId: EntityId,
    auditInfo: LocalDeploymentAuditInfo,
    origin: string,
    task?: Database
  ): Promise<DeploymentResult>
  isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>>
  getContent(fileHash: ContentFileHash): Promise<ContentItem | undefined>
  deleteContent(fileHashes: ContentFileHash[]): Promise<void>
  storeContent(fileHash: ContentFileHash, content: Buffer): Promise<void>
  getStatus(): ServerStatus
  getDeployments(options?: DeploymentOptions, task?: Database): Promise<PartialDeploymentHistory<Deployment>>
  getAllFailedDeployments(): Promise<FailedDeployment[]>
  getPointerChanges(
    filters?: PointerChangesFilters,
    offset?: number,
    limit?: number,
    lastId?: string,
    task?: Database
  ): Promise<PartialDeploymentPointerChanges>
  getEntitiesByIds(ids: EntityId[], task?: Database): Promise<Entity[]>
  getEntitiesByPointers(type: EntityType, pointers: Pointer[], task?: Database): Promise<Entity[]>
  listenToDeployments(listener: DeploymentListener): void
}

/**
 * This version of the service is aware of the fact that the content service lives inside a cluster,
 * and that deployments can also happen on other servers.
 */
export interface ClusterDeploymentsService {
  reportErrorDuringSync(
    entityType: EntityType,
    entityId: EntityId,
    reason: FailureReason,
    errorDescription?: string
  ): Promise<null>
  deployEntityFromCluster(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfo): Promise<DeploymentResult>
  deployOverwrittenEntityFromCluster(
    entityFile: ContentFile,
    entityId: EntityId,
    auditInfo: AuditInfo
  ): Promise<DeploymentResult>
  isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>>
  areEntitiesAlreadyDeployed(entityIds: EntityId[]): Promise<Map<EntityId, boolean>>
}

export type LocalDeploymentAuditInfo = Pick<AuditInfo, 'version' | 'authChain' | 'migrationData'>

export type DeploymentEvent = {
  entity: Entity
  auditInfo: AuditInfo
  origin: string
}

export type DeploymentListener = (deployment: DeploymentEvent) => void | Promise<void>

export type InvalidResult = { errors: string[] }

export type DeploymentResult = Timestamp | InvalidResult

export function isSuccessfulDeployment(deploymentResult: DeploymentResult): deploymentResult is Timestamp {
  return typeof deploymentResult === 'number'
}

export function isInvalidDeployment(deploymentResult: DeploymentResult): deploymentResult is InvalidResult {
  return !isSuccessfulDeployment(deploymentResult)
}
