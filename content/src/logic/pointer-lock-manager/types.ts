import { EntityType } from '@dcl/schemas'

export interface IPointerLockManager {
  /**
   * Try to claim the given pointers for an in-flight deploy of the given entity type.
   * Returns the list of pointers that are already being deployed by some other concurrent
   * caller and could not be claimed; empty if all pointers were acquired successfully.
   */
  tryAcquire(entityType: EntityType, pointers: string[]): string[]
  /**
   * Release a previously-acquired set of pointers. Safe to call even if the caller
   * acquired only some of the pointers (e.g. failure mid-acquire).
   */
  release(entityType: EntityType, pointers: string[]): void
}
