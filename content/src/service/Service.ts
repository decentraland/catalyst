import {
  AuditInfo,
  ContentFileHash,
  Deployment,
  Entity,
  EntityId,
  EntityType,
  PartialDeploymentHistory,
  Pointer,
  Timestamp
} from 'dcl-catalyst-commons'
import { AuthChain } from 'dcl-crypto'
import { Readable } from 'stream'
import { Database } from '../repository/Database'
import { ContentItem } from '../storage/ContentStorage'
import { DeploymentOptions } from './deployments/types'
import { FailedDeployment } from '../ports/FailedDeploymentsCache'

/**x
 * This version of the service can tell clients about the state of the Metaverse. It assumes that all deployments
 * were done directly to it, and it is not aware that the service lives inside a cluster.
 */
export interface MetaverseContentService {
  start(): Promise<void>
  deployEntity(
    files: DeploymentFiles,
    entityId: EntityId,
    auditInfo: LocalDeploymentAuditInfo,
    context: DeploymentContext,
    task?: Database
  ): Promise<DeploymentResult>
  isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>>
  getContent(fileHash: ContentFileHash): Promise<ContentItem | undefined>
  deleteContent(fileHashes: ContentFileHash[]): Promise<void>
  storeContent(fileHash: ContentFileHash, content: Buffer | Readable): Promise<void>
  getDeployments(options?: DeploymentOptions, task?: Database): Promise<PartialDeploymentHistory<Deployment>>
  getActiveDeploymentsByContentHash(hash: string, task?: Database): Promise<EntityId[]>
  getAllFailedDeployments(): FailedDeployment[]
  getEntitiesByIds(ids: EntityId[], task?: Database): Promise<Entity[]>
  getEntitiesByPointers(type: EntityType, pointers: Pointer[], task?: Database): Promise<Entity[]>
  listenToDeployments(listener: DeploymentListener): void
  reportErrorDuringSync(
    entityType: EntityType,
    entityId: EntityId,
    reason: string,
    authChain: AuthChain,
    errorDescription?: string
  ): void
  getEntityById(entityId: EntityId): Promise<{ entityId: string; localTimestamp: number } | void>
}

export type LocalDeploymentAuditInfo = Pick<AuditInfo, 'authChain' | 'migrationData'>

export type DeploymentEvent = {
  entity: Entity
  auditInfo: AuditInfo
}

export type DeploymentListener = (deployment: DeploymentEvent) => void | Promise<void>

export type InvalidResult = { errors: string[] }

export type DeploymentResult = Timestamp | InvalidResult

export type DeploymentFiles = Uint8Array[] | Map<ContentFileHash, Uint8Array>

export function isSuccessfulDeployment(deploymentResult: DeploymentResult): deploymentResult is Timestamp {
  return typeof deploymentResult === 'number'
}

export function isInvalidDeployment(deploymentResult: DeploymentResult): deploymentResult is InvalidResult {
  return !isSuccessfulDeployment(deploymentResult)
}

export enum DeploymentContext {
  LOCAL = 'LOCAL',
  SYNCED = 'SYNCED',
  SYNCED_LEGACY_ENTITY = 'SYNCED_LEGACY_ENTITY',
  FIX_ATTEMPT = 'FIX_ATTEMPT'
}
