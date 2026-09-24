import { IBaseComponent } from '@well-known-components/interfaces'

export interface IContentLocks extends IBaseComponent {
  /**
   * Runs a storage mutation through publication under the shared content lock. When `entityId` is
   * given, also serializes every operation on that entity, waiting without holding a connection.
   * Released only after `operation` settles.
   * @throws EntityLockTimeoutError when the entity stays busy past the bounded wait.
   */
  withRead<T>(operation: () => Promise<T>, entityId?: string): Promise<T>
  /** Runs a reference check plus physical delete excluding every in-flight storage mutation. */
  withWrite<T>(operation: () => Promise<T>): Promise<T>
}

export type ContentLocksOptions = {
  /** Longest a request retries a busy lock or a saturated pool before failing, in milliseconds. */
  maxWaitMs?: number
  /** How long one attempt waits for a pool connection, in milliseconds. */
  connectionTimeoutMs?: number
}
