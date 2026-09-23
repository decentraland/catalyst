import { IBaseComponent } from '@well-known-components/interfaces'

export interface IContentLocks extends IBaseComponent {
  /**
   * Runs a storage mutation through publication under the shared content lock. When `entityId` is
   * given, also serializes every operation on that entity. Released only after `operation` settles.
   */
  withRead<T>(operation: () => Promise<T>, entityId?: string): Promise<T>
  /** Runs a reference check plus physical delete excluding every in-flight storage mutation. */
  withWrite<T>(operation: () => Promise<T>): Promise<T>
}
