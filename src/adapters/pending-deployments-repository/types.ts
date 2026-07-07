import { EntityType } from '@dcl/schemas'
import { DatabaseClient } from '../../adapters/database'

export interface PendingDeploymentRow {
  entityId: string
  entityType: EntityType
  pointers: string[]
  contentHashes: string[]
  deployerAddress: string
  createdAt: Date
  updatedAt: Date
}

export interface UpsertPendingDeployment {
  entityId: string
  entityType: EntityType
  pointers: string[]
  contentHashes: string[]
  deployerAddress: string
}

export interface IPendingDeploymentsRepository {
  /** Returns the pending deployment for an entity id, or undefined if none exists. */
  getByEntityId(db: DatabaseClient, entityId: string): Promise<PendingDeploymentRow | undefined>
  /**
   * Inserts or refreshes a pending deployment. On conflict only `updated_at` is bumped so `created_at`
   * (the deployment-TTL anchor) stays stable across resume requests.
   */
  upsert(db: DatabaseClient, row: UpsertPendingDeployment): Promise<void>
  deleteByEntityId(db: DatabaseClient, entityId: string): Promise<void>
  /**
   * Deletes every pending deployment whose pointers overlap the given ones, except `excludeEntityId`.
   * Returns the entity ids that were removed (for logging/metrics). Enforces the "one pending
   * deployment per parcel set" rule.
   */
  deleteOverlappingPointers(db: DatabaseClient, pointers: string[], excludeEntityId: string): Promise<string[]>
  /** Deletes pending deployments older than `ttlMs`. Returns the number of rows removed. */
  deleteExpired(db: DatabaseClient, ttlMs: number): Promise<number>
  /**
   * Streams the entity ids and content hashes of every non-expired pending deployment. Used by the
   * garbage-collection bloom sweep so staged content is never reclaimed while its upload is in flight.
   */
  streamAllNonExpiredHashes(db: DatabaseClient, ttlMs: number, options?: { batchSize?: number }): AsyncIterable<string>
}
