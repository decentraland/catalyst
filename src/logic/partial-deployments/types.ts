import { AuthChain } from '@dcl/crypto'
import { Readable } from 'stream'

/** One uploaded file of a staging batch, read from wherever the request put it. */
export type StagedFile = {
  size: number
  /** Opens a new stream over the file's bytes. */
  openStream(): Readable
  /** Reads the whole file into memory. Only for small files such as the entity file. */
  read(): Promise<Uint8Array>
}

export type StageDeploymentInput = {
  entityId: string
  authChain: AuthChain
  /** Uploaded files keyed by their multipart field name (the content hash, or the entity id). */
  files: Map<string, StagedFile>
}

export type StageDeploymentResult =
  | { kind: 'deployed'; creationTimestamp: number }
  | { kind: 'incomplete'; missing: string[] }

export interface IPartialDeployments {
  /**
   * Stages one batch of a partial (multi-request) scene deployment, keyed by entity id. Validates what
   * doesn't need the full content set, reserves bytes, stores the batch and records progress. The batch
   * that completes the content set is verified, deployed and returns `{ kind: 'deployed' }`; otherwise
   * `{ kind: 'incomplete' }` lists the hashes still missing. Must run under the content lock.
   *
   * Throws {@link InvalidPartialDeploymentError} for client errors.
   */
  stageDeployment(input: StageDeploymentInput): Promise<StageDeploymentResult>
  /** Deletes expired uploads' unreferenced staged content, then releases their accounting. */
  cleanupExpired(): Promise<number>
}
