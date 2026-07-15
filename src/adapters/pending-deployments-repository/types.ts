import { EntityType } from '@dcl/schemas'
import { DatabaseClient } from '../../adapters/database'

export interface PendingDeploymentRow {
  entityId: string
  entityType: EntityType
  pointers: string[]
  contentHashes: string[]
  deployerAddress: string
  entityTimestamp: number
  createdAt: Date
  updatedAt: Date
}

export interface UpsertPendingDeployment {
  entityId: string
  entityType: EntityType
  pointers: string[]
  contentHashes: string[]
  deployerAddress: string
  entityTimestamp: number
}

/** An overlapping pending deployment, used to resolve which of two uploads keeps the parcel-set slot. */
export interface OverlappingPendingDeployment {
  entityId: string
  entityTimestamp: number
}

export interface IPendingDeploymentsRepository {
  /** Returns the pending deployment for an entity id, or undefined if none exists. */
  getByEntityId(db: DatabaseClient, entityId: string): Promise<PendingDeploymentRow | undefined>
  /**
   * Inserts or refreshes a pending deployment. On conflict `created_at` (the deployment-TTL anchor)
   * stays stable across resume requests while the row is within `ttlMs`; an expired row is dead state,
   * so its `created_at` is reset to now, starting a fresh window.
   */
  upsert(db: DatabaseClient, row: UpsertPendingDeployment, ttlMs: number): Promise<void>
  deleteByEntityId(db: DatabaseClient, entityId: string): Promise<void>
  /**
   * Returns the non-expired pending deployments whose pointers overlap the given ones, except
   * `excludeEntityId`, with their entity timestamps — so the caller can decide whether the incoming
   * upload is newer. Rows past `ttlMs` are dead state and never surface here.
   */
  getOverlappingPointers(
    db: DatabaseClient,
    pointers: string[],
    excludeEntityId: string,
    ttlMs: number
  ): Promise<OverlappingPendingDeployment[]>
  /**
   * Deletes every pending deployment whose pointers overlap the given ones, except `excludeEntityId`,
   * enforcing the "one pending deployment per parcel set" rule. Returns the removed entity ids (for
   * logging/metrics). When `onlyDeployer` is set the delete is restricted to that deployer's own rows —
   * used on the access-check-skipping resume fast path so it can't evict another deployer's upload.
   */
  deleteOverlappingPointers(
    db: DatabaseClient,
    pointers: string[],
    excludeEntityId: string,
    onlyDeployer?: string
  ): Promise<string[]>
  /**
   * Counts a deployer's non-expired pending deployments (excluding `excludeEntityId`). `count + 1` is the
   * deployer's post-upsert row total; the caller enforces the concurrent-pending cap with it, but only
   * for a NEW upload (a resume is exempt, so lowering the cap can't wedge in-flight uploads).
   */
  countActiveByDeployer(
    db: DatabaseClient,
    deployerAddress: string,
    ttlMs: number,
    excludeEntityId: string
  ): Promise<number>
  /** Deletes pending deployments older than `ttlMs`. Returns the number of rows removed. */
  deleteExpired(db: DatabaseClient, ttlMs: number): Promise<number>
  /**
   * Streams the entity ids and content hashes of every non-expired pending deployment. Used by the
   * garbage-collection bloom sweep so staged content is never reclaimed while its upload is in flight.
   */
  streamAllNonExpiredHashes(db: DatabaseClient, ttlMs: number, options?: { batchSize?: number }): AsyncIterable<string>
  /**
   * Takes the transaction-scoped advisory locks that serialize the pending-deployment "reject-newer /
   * replace-overlapping + upsert" critical section: a per-deployer lock (guards the cap) plus one lock
   * per pointer in sorted order (guards overlap, deadlock-free). Only contending requests serialize;
   * uploads on disjoint pointers by different deployers proceed concurrently. Must be called inside a
   * transaction; released automatically on commit.
   */
  acquireStagingLocks(db: DatabaseClient, pointers: string[], deployerAddress: string): Promise<void>
}
