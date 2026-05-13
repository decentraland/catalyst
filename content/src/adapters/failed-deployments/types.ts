import { AuthChain } from '@dcl/crypto'
import { EntityType } from '@dcl/schemas'
import { DatabaseClient } from '../database'

export enum FailureReason {
  DEPLOYMENT_ERROR = 'Deployment error' // During sync, there was an error during deployment. Could be due to a validation
}

export enum NoFailure {
  NOT_MARKED_AS_FAILED
}

export type DeploymentStatus = FailureReason | NoFailure

export type FailedDeployment = {
  entityType: EntityType
  entityId: string
  failureTimestamp: number
  reason: FailureReason
  authChain: AuthChain
  errorDescription: string
  snapshotHash?: string
}

export type SnapshotFailedDeployment = FailedDeployment & Required<Pick<FailedDeployment, 'snapshotHash'>>

export function isSnapshotFailedDeployment(
  failedDeployment: FailedDeployment
): failedDeployment is SnapshotFailedDeployment {
  return 'snapshotHash' in failedDeployment && typeof failedDeployment.snapshotHash == 'string'
}

export type IFailedDeploymentsComponent = {
  start(): Promise<void>

  // ---- Cache-only reads ----
  getAllFailedDeployments(): Promise<FailedDeployment[]>
  findFailedDeployment(entityId: string): Promise<FailedDeployment | undefined>

  // ---- SQL writes ----
  // Caller supplies the `db` client (pool or tx). These methods are pure persistence —
  // they do NOT touch the in-memory cache. The caller is responsible for the matching
  // `cacheFailedDeployment` after the transaction has committed. See the component
  // jsdoc for why this split is load-bearing.
  /** Persist a snapshot-failed deployment via SQL. Does not update the cache. */
  saveSnapshotFailedDeployment(db: DatabaseClient, deployment: SnapshotFailedDeployment): Promise<void>
  /** Delete a failed deployment via SQL. Does not update the cache. */
  deleteFailedDeployment(db: DatabaseClient, entityId: string): Promise<void>

  // ---- Cache-only writes ----
  /**
   * Upsert a failed deployment in the in-memory cache only. Used both for non-persisted
   * (non-snapshot) failures and as the post-transaction cache update that pairs with
   * the SQL writes above.
   */
  cacheFailedDeployment(deployment: FailedDeployment): Promise<void>

  // ---- Convenience helpers ----
  /**
   * Delete from SQL + cache using the connection pool. Single statement, so the cache
   * evict can safely follow the SQL. Skips work if the entity isn't currently cached.
   */
  removeFailedDeployment(entityId: string): Promise<void>
}
