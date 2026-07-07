import { AuthChain } from '@dcl/crypto'

export type StageDeploymentInput = {
  entityId: string
  authChain: AuthChain
  /** Uploaded files keyed by their multipart field name (the content hash, or the entity id). */
  files: Map<string, Uint8Array>
}

export type StageDeploymentResult =
  | { kind: 'deployed'; creationTimestamp: number }
  | { kind: 'incomplete'; missing: string[] }

export interface IPartialDeployments {
  /**
   * Stage one request's worth of a partial (multi-request) scene deployment. Authenticates and
   * validates everything that doesn't require the full content set, stores the uploaded files, and
   * records/refreshes the pending deployment. When the request completes the content set, it runs the
   * full validation + deploy pipeline and returns `{ kind: 'deployed' }`; otherwise it returns
   * `{ kind: 'incomplete' }` with the hashes still missing.
   *
   * Throws {@link InvalidPartialDeploymentError} for client errors (mapped to HTTP 400).
   */
  stageDeployment(input: StageDeploymentInput): Promise<StageDeploymentResult>
  /** Deletes pending deployments older than PENDING_DEPLOYMENT_TTL. Returns the number removed. */
  cleanupExpired(): Promise<number>
}
