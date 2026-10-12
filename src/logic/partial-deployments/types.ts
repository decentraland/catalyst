import { AuthChain } from '@dcl/crypto'

export type StageDeploymentInput = {
  entityId: string
  authChain: AuthChain
  /** Uploaded files keyed by their multipart field name (the content hash, or the entity id). */
  files: Map<string, Uint8Array>
  /** When the request arrived (epoch ms), before its body was read. A new upload's lifetime starts here. */
  requestedAt: number
}

export type StageDeploymentResult =
  | { kind: 'deployed'; creationTimestamp: number }
  | { kind: 'incomplete'; missing: string[] }

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
   * that completes the content set is verified, deployed and returns `{ kind: 'deployed' }`; otherwise
   * `{ kind: 'incomplete' }` lists the hashes still missing. Hashing and validation run without any
   * lock; storage and publication take the shared content lock and the entity's lock, so batches of one
   * upload are serialized there.
   *
   * Throws {@link InvalidPartialDeploymentError} for client errors, and EntityLockTimeoutError when the
   * locks stay busy.
   */
  stageDeployment(input: StageDeploymentInput): Promise<StageDeploymentResult>
  /**
   * Deletes expired uploads' unreferenced staged content, then releases their accounting. A failing upload
   * is logged, counted and skipped, so it never blocks the rest; only listing or housekeeping failures throw.
   * A run visits every upload expired when it lists it, unless a busy content lock defers the rest.
   */
  cleanupExpired(): Promise<ExpiredCleanupSummary>
}
