import { EntityType } from '@dcl/schemas'

export interface IPointerLockManager {
  /**
   * Try to claim the given pointers for an in-flight deploy of the given entity type.
   * Returns the list of pointers that are already being deployed by some other concurrent
   * caller and could not be claimed; empty if all pointers were acquired successfully.
   */
  tryAcquire(entityType: EntityType, pointers: string[]): string[]
  /**
   * Release all pointers previously acquired by a successful `tryAcquire` call.
   * Calling with pointers not in the in-flight set is a no-op (idempotent).
   */
  release(entityType: EntityType, pointers: string[]): void
}
