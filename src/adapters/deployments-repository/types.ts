import { AuthChain } from '@dcl/crypto'
import { Entity, EntityType, SnapshotSyncDeployment } from '@dcl/schemas'
import { TimeRange } from '@dcl/snapshots-fetcher'
import { AuditInfo, DeploymentFilters, DeploymentSorting } from '../../deployment-types'
import { DatabaseClient, DatabaseTransactionalClient } from '../../adapters/database'
import { DeploymentId } from '../../types'

export type HistoricalDeployment = SnapshotSyncDeployment & {
  deploymentId: number
  localTimestamp: number
  metadata: any
  deployerAddress: string
  version: string
  overwrittenBy?: string
}

export interface HistoricalDeploymentsRow {
  id: number
  deployer_address: string
  version: string
  entity_type: EntityType
  entity_id: string
  entity_metadata: any
  entity_timestamp: number
  entity_pointers: string[]
  local_timestamp: number
  auth_chain: AuthChain
  deleter_deployment: number

  overwritten_by?: string
}

export interface MigrationDataRow {
  deployment: number
  original_metadata: any
}

export interface IDeploymentsRepository {
  deploymentExists(db: DatabaseClient, entityId: string): Promise<boolean>
  streamAllEntityIdsInTimeRange(db: DatabaseClient, timeRange: TimeRange): AsyncIterable<string>
  streamAllDistinctEntityIds(db: DatabaseClient): AsyncIterable<string>
  getHistoricalDeployments(
    db: DatabaseClient,
    offset: number,
    limit: number,
    filters?: DeploymentFilters,
    sortBy?: DeploymentSorting,
    lastId?: string,
    includeMetadata?: boolean
  ): Promise<HistoricalDeployment[]>
  getActiveDeploymentsByContentHash(db: DatabaseClient, contentHash: string): Promise<string[]>
  getEntityById(db: DatabaseClient, entityId: string): Promise<{ entityId: string; localTimestamp: number } | undefined>
  saveDeployment(
    db: DatabaseClient,
    entity: Entity,
    auditInfo: AuditInfo,
    overwrittenBy: DeploymentId | null
  ): Promise<DeploymentId>
  getDeployments(db: DatabaseClient, deploymentIds: Set<number>): Promise<{ id: number; pointers: string[] }[]>
  /**
   * True if a deployment newer than `entity` (by entity_timestamp, then LOWER(entity_id)) already
   * exists on any of its pointers for the same type. An EXISTS probe, not a full fetch.
   */
  hasNewerDeploymentOnPointers(db: DatabaseClient, entity: Entity): Promise<boolean>
  setEntitiesAsOverwritten(
    db: DatabaseTransactionalClient,
    allOverwritten: Set<DeploymentId>,
    overwrittenBy: DeploymentId
  ): Promise<void>
  calculateOverwrote(db: DatabaseClient, entity: Entity): Promise<DeploymentId[]>
  calculateOverwrittenByManyFast(db: DatabaseClient, entity: Entity): Promise<{ id: number }[]>
  calculateOverwrittenBySlow(db: DatabaseClient, entity: Entity): Promise<{ id: number }[]>
}
