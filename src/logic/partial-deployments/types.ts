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
}

export type StageDeploymentResult =
  | { kind: 'deployed'; creationTimestamp: number }
  | { kind: 'incomplete'; missing: string[] }

export interface IPartialDeployments {
  /**
   * Stages one batch of a partial (multi-request) scene deployment, keyed by entity id. Validates what
   * doesn't need the full content set, reserves bytes, stores the batch and records progress. Files
   * already in storage are neither stored again nor charged against the staging budgets. The batch
   * that completes the content set is verified, deployed and returns `{ kind: 'deployed' }`; otherwise
   * `{ kind: 'incomplete' }` lists the hashes still missing. Hashing and validation run without any
   * lock; storage and publication take the shared content lock and the entity's lock, so batches of one
   * upload are serialized there.
   *
   * Throws {@link InvalidPartialDeploymentError} for client errors, EntityLockTimeoutError when the
   * locks stay busy, and UploadBudgetExceededError when the memory budget can't hold a resume's entity file.
   */
  stageDeployment(input: StageDeploymentInput): Promise<StageDeploymentResult>
  /** Deletes expired uploads' unreferenced staged content, then releases their accounting. */
  cleanupExpired(): Promise<number>
}
