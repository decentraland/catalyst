import { AuthChain } from '@dcl/crypto'
import { Readable } from 'stream'

/** One uploaded file of a staging batch, streamed from wherever the request put it. */
export type StagedFile = {
  size: number
  /** Opens a new stream over the file's bytes. */
  openStream(): Readable
}

export type StageDeploymentInput = {
  entityId: string
  authChain: AuthChain
  /** Uploaded files keyed by their multipart field name (the content hash, or the entity id). */
  files: Map<string, StagedFile>
  /**
   * The bytes of the batch's entity file, read in under the caller's memory budget share, which it holds
   * until staging settles. Required when `files` carries an entity file within MAX_ENTITY_FILE_SIZE_BYTES.
   */
  entityFile?: Uint8Array
  /** When the request arrived (epoch ms), before its body was read. A new upload's lifetime starts here. */
  requestedAt: number
  /** Called once the batch joins its upload: `created` within its budgets, or resumed by its creator. */
  onAdmitted?: (admission: { created: boolean }) => void
}

export type StageDeploymentResult =
  /** This request published the entity. */
  | { kind: 'deployed'; creationTimestamp: number }
  /** The entity was already published, by an earlier or a concurrent request. */
  | { kind: 'replayed'; creationTimestamp: number }
  | { kind: 'incomplete'; missing: string[] }

/** A timed step of a partial upload batch, labelling `dcl_partial_upload_stage_duration_seconds`. */
export type PartialUploadStage =
  | 'hash'
  | 'validate'
  | 'lock_wait'
  | 'inventory'
  | 'accounting'
  | 'store'
  | 'progress'
  | 'finalize_verify'
  | 'finalize_deploy'

/** What one expired-upload cleanup run did. */
export type ExpiredCleanupSummary = {
  /** Uploads reclaimed. */
  removed: number
  /** Uploads whose reclaim failed; they stay charged and are retried on the next run. */
  failed: number
  /** `success` reclaimed every listed upload, `deferred` stopped on a busy content lock, `error` had a failure. */
  outcome: 'success' | 'deferred' | 'error'
}

export interface IPartialDeployments {
  /**
   * Stages one batch of a partial (multi-request) scene deployment, keyed by entity id. Validates what
   * doesn't need the full content set, reserves bytes, stores the batch and records progress. Files
   * already in storage are not stored again, and are charged against the staging budgets unless
   * published content (an active deployment or a snapshot) references them. The batch
   * that completes the content set is verified, deployed and returns `{ kind: 'deployed' }`; a batch for an
   * entity another request already published returns `{ kind: 'replayed' }`; otherwise
   * `{ kind: 'incomplete' }` lists the hashes still missing. Hashing and validation run without any
   * lock; storage and publication take the shared content lock and the entity's lock, so batches of one
   * upload are serialized there.
   *
   * Throws {@link InvalidPartialDeploymentError} for client errors, EntityLockTimeoutError when the
   * locks stay busy, and UploadBudgetExceededError when the memory budget can't hold a resume's entity file.
   */
  stageDeployment(input: StageDeploymentInput): Promise<StageDeploymentResult>
  /**
   * Deletes expired uploads' unreferenced staged content, then releases their accounting. A failing upload
   * is logged, counted and skipped, so it never blocks the rest; only listing or housekeeping failures throw.
   * A run visits every upload expired when it lists it, unless a busy content lock defers the rest.
   */
  cleanupExpired(): Promise<ExpiredCleanupSummary>
  /** Whether `deployerAddress` started a live upload of `entityId`, whose batches skip the access check. */
  isLiveUploadOf(entityId: string, deployerAddress: string): Promise<boolean>
}
