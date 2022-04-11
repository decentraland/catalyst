import {
  AuditInfo,
  ContentFileHash,
  Deployment,
  Entity,
  EntityId,
  EntityType,
  PartialDeploymentHistory,
  Timestamp
} from 'dcl-catalyst-commons'
import { AuthChain } from 'dcl-crypto'
import { ContentItem } from '../ports/contentStorage/contentStorage'
import { FailedDeployment } from '../ports/failedDeploymentsCache'
import { Database } from '../repository/Database'
import { DeploymentOptions } from './deployments/types'

/**x
 * This version of the service can tell clients about the state of the Metaverse. It assumes that all deployments
 * were done directly to it, and it is not aware that the service lives inside a cluster.
 */
export interface MetaverseContentService {
  deployEntity(
    files: DeploymentFiles,
    entityId: EntityId,
    auditInfo: LocalDeploymentAuditInfo,
    context: DeploymentContext,
    task?: Database
  ): Promise<DeploymentResult>
  isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>>
  getContent(fileHash: ContentFileHash): Promise<ContentItem | undefined>
  getDeployments(options?: DeploymentOptions): Promise<PartialDeploymentHistory<Deployment>>
  getAllFailedDeployments(): FailedDeployment[]
  reportErrorDuringSync(
    entityType: EntityType,
    entityId: EntityId,
    reason: string,
    authChain: AuthChain,
    errorDescription?: string
  ): void
  getEntityById(entityId: EntityId): Promise<{ entityId: string; localTimestamp: number } | void>
}

export type LocalDeploymentAuditInfo = Pick<AuditInfo, 'authChain'>

export type DeploymentEvent = {
  entity: Entity
  auditInfo: AuditInfo
}

export type InvalidResult = { errors: string[] }
export function InvalidResult(val: InvalidResult): InvalidResult {
  return val
}

export type DeploymentResult = Timestamp | InvalidResult

export type DeploymentFiles = Uint8Array[] | Map<ContentFileHash, Uint8Array>

export function isSuccessfulDeployment(deploymentResult: DeploymentResult): deploymentResult is Timestamp {
  return typeof deploymentResult === 'number'
}

export function isInvalidDeployment(deploymentResult: any): deploymentResult is InvalidResult {
  if (deploymentResult && typeof deploymentResult === 'object' && Array.isArray(deploymentResult['errors'])) {
    return true
  }

  return false
}

export enum DeploymentContext {
  LOCAL = 'LOCAL',
  SYNCED = 'SYNCED',
  SYNCED_LEGACY_ENTITY = 'SYNCED_LEGACY_ENTITY',
  FIX_ATTEMPT = 'FIX_ATTEMPT'
}
