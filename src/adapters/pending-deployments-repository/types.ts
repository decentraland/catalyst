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
  /** When the upload's first request arrived (epoch ms); its fixed lifetime starts here. */
  createdAt: number
}

/** One known file of an upload; `stored` marks completed writes and verified reused content. */
export interface FileReceipt {
  hash: string
  size: number
  stored: boolean
  /** True when this upload writes the file, so its size counts against the staging budgets. */
  charged: boolean
}

export interface ReservationTotals {
  /** Charged bytes of this upload. */
  upload: bigint
  /** Charged bytes of every upload of the deployer, expired ones included. */
  account: bigint
  /** Charged bytes of every upload on the server, expired ones included. */
  total: bigint
  /** Bytes of this upload's known content files, charged or already stored, excluding its entity file. */
  scene: bigint
}

/** Server-wide staging state, expired uploads awaiting cleanup included. */
export interface StagingTotals {
  /** Reserved bytes of every upload. */
  total: number
  /** Reserved bytes of expired uploads. */
  expired: number
  liveUploads: number
  expiredUploads: number
}

/** The deployer's fixed one-minute byte window after adding a batch to it. */
export interface IncomingBytesWindow {
  bytes: bigint
  /** Milliseconds until the window elapses and the next batch starts a new one, by the database clock. */
  endsInMs: number
}

/** Which uploads `getOldestCreatedAt` considers. */
export interface OldestUploadScope {
  /** Only this deployer's uploads; every upload on the server otherwise. */
  deployerAddress?: string
}

export interface IPendingDeploymentsRepository {
  /** Returns the upload for an entity id, live or expired, or undefined if none exists. */
  getByEntityId(db: DatabaseClient, entityId: string): Promise<PendingDeploymentRow | undefined>
  /** Creates an upload at `createdAt`, which is fixed from here on: nothing extends an upload's lifetime. */
  insert(db: DatabaseClient, row: InsertPendingDeployment): Promise<PendingDeploymentRow>
  /** Counts every upload of a deployer, including expired ones awaiting cleanup. */
  countByDeployer(db: DatabaseClient, deployerAddress: string): Promise<number>
  /** Transaction-scoped lock serializing a deployer's upload creation, guarding the count cap. */
  acquireDeployerLock(db: DatabaseClient, deployerAddress: string): Promise<void>
  /** Transaction-scoped lock making the account and server-wide byte budgets atomic. */
  acquireBudgetLock(db: DatabaseClient): Promise<void>
  /** Adds receipts without double-charging a hash already reserved for the upload; a hash stays charged once charged. */
  upsertFileReceipts(db: DatabaseClient, entityId: string, receipts: FileReceipt[]): Promise<void>
  /** Refreshes the cached `reserved_bytes` of an upload from its charged receipts. */
  refreshReservedBytes(db: DatabaseClient, entityId: string): Promise<void>
  getReservationTotals(db: DatabaseClient, entityId: string, deployerAddress: string): Promise<ReservationTotals>
  /** Adds bytes to the deployer's fixed one-minute window and returns the window total and when it ends. */
  addIncomingBytes(db: DatabaseClient, deployerAddress: string, bytes: number): Promise<IncomingBytesWindow>
  /** Creation time (epoch ms) of the oldest upload in scope, expired ones included, or undefined if none. */
  getOldestCreatedAt(db: DatabaseClient, scope: OldestUploadScope): Promise<number | undefined>
  markStored(db: DatabaseClient, entityId: string, hashes: string[]): Promise<void>
  /** Counts one more stored batch for the upload and returns its total. */
  countBatch(db: DatabaseClient, entityId: string): Promise<number>
  /** Marks the upload initialized while it is live; false once it has expired or been removed. */
  markInitializedIfLive(db: DatabaseClient, entityId: string, ttlMs: number): Promise<boolean>
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
  /** Reserved bytes and upload counts on the server, split by expiry. */
  getStagingTotals(db: DatabaseClient, ttlMs: number): Promise<StagingTotals>
  /**
   * Streams the entity ids and content hashes of every live upload. Used by the garbage-collection
   * bloom sweep so staged content is never reclaimed while its upload is in flight.
   */
  streamAllNonExpiredHashes(db: DatabaseClient, ttlMs: number, options?: { batchSize?: number }): AsyncIterable<string>
}
