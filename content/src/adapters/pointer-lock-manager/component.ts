import { EntityType } from '@dcl/schemas'
import { IPointerLockManager } from './types'

/**
 * In-memory concurrency gate ensuring a single deploy can hold a given pointer
 * at a time. Pointers are partitioned by entity type — locks on the same pointer
 * across different types are independent.
 */
export function createPointerLockManager(): IPointerLockManager {
  const pointersBeingDeployed: Map<EntityType, Set<string>> = new Map()

  return {
    tryAcquire(entityType: EntityType, pointers: string[]): string[] {
      const inFlight = pointersBeingDeployed.get(entityType) ?? new Set<string>()
      const conflicts = pointers.filter((pointer) => inFlight.has(pointer))
      if (conflicts.length > 0) {
        return conflicts
      }
      for (const pointer of pointers) {
        inFlight.add(pointer)
      }
      pointersBeingDeployed.set(entityType, inFlight)
      return []
    },

    release(entityType: EntityType, pointers: string[]): void {
      const inFlight = pointersBeingDeployed.get(entityType)
      if (!inFlight) return
      for (const pointer of pointers) {
        inFlight.delete(pointer)
      }
      if (inFlight.size === 0) {
        pointersBeingDeployed.delete(entityType)
      }
    }
  }
}
