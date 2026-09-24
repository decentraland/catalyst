import { EntityType } from '@dcl/schemas'
import { DatabaseClient } from '../../adapters/database'

export interface PendingDeploymentRow {
  entityId: string
  entityType: EntityType
  pointers: string[]
  contentHashes: string[]
  /** Lowercased. */
  deployerAddress: string
  createdAt: Date
  updatedAt: Date
  /** True once the initial inventory of already-stored content was recorded. */
  initialized: boolean
}

export interface InsertPendingDeployment {
  entityId: string
  entityType: EntityType
  pointers: string[]
  contentHashes: string[]
  deployerAddress: string
}

/** A byte reservation for one staged file; `stored` marks completed writes and verified reused content. */
export interface FileReceipt {
  hash: string
  size: number
  stored: boolean
}

export interface ReservationTotals {
  /** Reserved bytes of every upload of the deployer, expired ones included. */
  account: bigint
  /** Reserved bytes of every upload on the server, expired ones included. */
  total: bigint
  /** Reserved bytes of this upload's content files, excluding its entity file. */
  scene: bigint
}

export interface IPendingDeploymentsRepository {
  /** Returns the upload for an entity id, live or expired, or undefined if none exists. */
  getByEntityId(db: DatabaseClient, entityId: string): Promise<PendingDeploymentRow | undefined>
  /** Creates an upload. `created_at` is fixed from here on: nothing extends an upload's lifetime. */
  insert(db: DatabaseClient, row: InsertPendingDeployment): Promise<PendingDeploymentRow>
  /** Counts every upload of a deployer, including expired ones awaiting cleanup. */
  countByDeployer(db: DatabaseClient, deployerAddress: string): Promise<number>
  /** Transaction-scoped lock serializing a deployer's upload creation, guarding the count cap. */
  acquireDeployerLock(db: DatabaseClient, deployerAddress: string): Promise<void>
  /** Transaction-scoped lock making the account and server-wide byte budgets atomic. */
  acquireBudgetLock(db: DatabaseClient): Promise<void>
  /** Adds receipts without double-charging a hash already reserved for the upload. */
  upsertFileReceipts(db: DatabaseClient, entityId: string, receipts: FileReceipt[]): Promise<void>
  /** Refreshes the cached `reserved_bytes` of an upload from its receipts. */
  refreshReservedBytes(db: DatabaseClient, entityId: string): Promise<void>
  getReservationTotals(db: DatabaseClient, entityId: string, deployerAddress: string): Promise<ReservationTotals>
  /** Adds bytes to the deployer's fixed one-minute window and returns the window total. */
  addIncomingBytes(db: DatabaseClient, deployerAddress: string, bytes: number): Promise<bigint>
  markStored(db: DatabaseClient, entityId: string, hashes: string[]): Promise<void>
  markInitialized(db: DatabaseClient, entityId: string): Promise<void>
  /** Forgets completed writes that a final verification found missing. Reservations stay charged. */
  markMissing(db: DatabaseClient, entityId: string, hashes: string[]): Promise<void>
  /** Returns the sizes of successfully stored files, never counting reservations as writes. */
  getStoredFiles(db: DatabaseClient, entityId: string): Promise<Map<string, number>>
  /** Storage keys an upload may own: its receipts plus its entity file. */
  getStagedKeys(db: DatabaseClient, entityId: string): Promise<string[]>
  deleteByEntityId(db: DatabaseClient, entityId: string): Promise<void>
  /** Removes an upload whose first batch was never admitted, so it doesn't hold a slot of its deployer's cap. */
  deleteUnadmitted(db: DatabaseClient, entityId: string): Promise<void>
  /** Returns up to `limit` expired upload ids. */
  listExpired(db: DatabaseClient, ttlMs: number, limit: number): Promise<string[]>
  /** Deletes an upload only if it is still expired, releasing its accounting. */
  deleteExpiredByEntityId(db: DatabaseClient, entityId: string, ttlMs: number): Promise<void>
  /** Drops rate windows that have already elapsed. */
  deleteElapsedRateWindows(db: DatabaseClient): Promise<void>
  /** Reserved bytes on the server, and the part held by expired uploads awaiting cleanup. */
  getReservedBytes(db: DatabaseClient, ttlMs: number): Promise<{ total: number; expired: number }>
  /**
   * Streams the entity ids and content hashes of every live upload. Used by the garbage-collection
   * bloom sweep so staged content is never reclaimed while its upload is in flight.
   */
  streamAllNonExpiredHashes(db: DatabaseClient, ttlMs: number, options?: { batchSize?: number }): AsyncIterable<string>
}
