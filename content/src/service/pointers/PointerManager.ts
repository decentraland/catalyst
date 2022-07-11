import { Entity } from '@dcl/schemas'
import { DeploymentId, DeploymentsRepository } from '../../repository/extensions/DeploymentsRepository'

/**
 * Manage all pointer data
 */
export class PointerManager {
  /**
   * Commit a new entity, and return the 'before & after' generated by the deployment
   */
  async referenceEntityFromPointers(
    deploymentsRepo: DeploymentsRepository,
    deploymentId: DeploymentId,
    entity: Entity,
    overwrote: Set<number>,
    overwritten: boolean
  ): Promise<DeploymentResult> {
    const result: DeploymentResult = new Map()

    if (!overwritten) {
      // Fetch overwritten deployments from the DB
      const overwrittenDeployments = await deploymentsRepo.getDeployments(overwrote)

      // Add all pointers in current entity to the map as SET
      for (const pointer of entity.pointers) {
        result.set(pointer, {
          before: overwrittenDeployments.find((dep) => dep.pointers.includes(pointer))?.id,
          after: DELTA_POINTER_RESULT.SET
        })
      }

      // Add all pointers from the overwritten deployments that don't exist in the new entity as CLEARED
      for (const dep of overwrittenDeployments) {
        for (const pointer of dep.pointers) {
          if (!result.has(pointer)) {
            result.set(pointer, {
              before: dep.id,
              after: DELTA_POINTER_RESULT.CLEARED
            })
          }
        }
      }
    }

    return result
  }

  calculateOverwrites(
    deploymentsRepo: DeploymentsRepository,
    entity: Entity
  ): Promise<{ overwrote: Set<DeploymentId>; overwrittenBy: DeploymentId | null }> {
    return deploymentsRepo.calculateOverwrites(entity)
  }
}

export type DeploymentResult = Map<string, { before: DeploymentId | undefined; after: DELTA_POINTER_RESULT }>

export enum DELTA_POINTER_RESULT {
  SET = 'set',
  CLEARED = 'cleared'
}
