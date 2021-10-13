import { Pointer } from 'dcl-catalyst-commons'
import { DeploymentId } from '../../repository/extensions/DeploymentsRepository'
import { LastDeployedPointersRepository } from '../../repository/extensions/LastDeployedPointersRepository'
import { PointerHistoryRepository } from '../../repository/extensions/PointerHistoryRepository'
import { Entity } from '../../service/Entity'
import { happenedBefore } from '../../service/time/TimeSorting'

/**
 * Manage all pointer data
 */
export class PointerManager {
  /**
   * Commit a new entity, and return the 'before & after' generated by the deployment
   */
  async referenceEntityFromPointers(
    lastDeployedPointersRepo: LastDeployedPointersRepository,
    deploymentId: DeploymentId,
    entity: Entity
  ): Promise<DeploymentResult> {
    // Fetch active last deployments on pointers
    const lastDeployments = await lastDeployedPointersRepo.getLastActiveDeploymentsOnPointers(
      entity.type,
      entity.pointers
    )

    // Add a made up deployments for the pointers where there was no deployment yet
    const pointersWithDeployments = lastDeployments
      .map((deployment) => deployment.pointers)
      .reduce((accum, curr) => accum.concat(curr), [])
    const pointersWithoutDeployments = diff(entity.pointers, pointersWithDeployments)
    if (pointersWithoutDeployments.size > 0) {
      lastDeployments.push({
        entityId: 'NOT_GONNA_BE_USED',
        deployment: 0,
        timestamp: -1,
        pointers: Array.from(pointersWithoutDeployments.values()),
        deleted: true
      })
    }

    // Determine if the entity being deployed will become active
    const willDeploymentBecomeActive = lastDeployments.every((lastDeployment) => happenedBefore(lastDeployment, entity))

    // Prepare variables
    const result: DeploymentResult = new Map()
    const overwrite: Set<Pointer> = new Set()

    lastDeployments.forEach((lastDeployment) => {
      // Calculate the intersection of pointers between the last deployment and the new one
      const intersection: Set<Pointer> = intersect(lastDeployment.pointers, entity.pointers)

      if (happenedBefore(lastDeployment, entity)) {
        intersection.forEach((pointer) => {
          // If the last deployment happened before, then the intersected pointers will point either to the new entity, or to nothing
          if (!lastDeployment.deleted || willDeploymentBecomeActive) {
            result.set(pointer, {
              before: !lastDeployment.deleted ? lastDeployment.deployment : undefined,
              after: willDeploymentBecomeActive ? DELTA_POINTER_RESULT.SET : DELTA_POINTER_RESULT.CLEARED
            })
          }

          // All pointers on the intersection will need to be overwritten
          overwrite.add(pointer)
        })

        // If the last deployment wasn't already deleted, then the pointers not pointing to the new entity will point to nothing
        if (!lastDeployment.deleted) {
          const onlyOnLastDeployed: Set<Pointer> = diff(lastDeployment.pointers, entity.pointers)
          onlyOnLastDeployed.forEach((pointer) =>
            result.set(pointer, { before: lastDeployment.deployment, after: DELTA_POINTER_RESULT.CLEARED })
          )
        }
      }
    })

    // Overwrite the currently last entities that need to be overwritten
    await lastDeployedPointersRepo.setAsLastActiveDeploymentsOnPointers(
      deploymentId,
      entity.type,
      Array.from(overwrite.values())
    )

    return result
  }

  calculateOverwrites(
    pointerHistoryRepo: PointerHistoryRepository,
    entity: Entity
  ): Promise<{ overwrote: Set<DeploymentId>; overwrittenBy: DeploymentId | null }> {
    return pointerHistoryRepo.calculateOverwrites(entity)
  }

  addToHistory(pointerHistoryRepo: PointerHistoryRepository, deploymentId: DeploymentId, entity: Entity) {
    return pointerHistoryRepo.addToHistory(deploymentId, entity)
  }
}

export type DeploymentResult = Map<Pointer, { before: DeploymentId | undefined; after: DELTA_POINTER_RESULT }>

export enum DELTA_POINTER_RESULT {
  SET = 'set',
  CLEARED = 'cleared'
}

function intersect(pointers1: Pointer[], pointers2: Pointer[]): Set<Pointer> {
  return new Set(pointers1.filter((pointer) => pointers2.includes(pointer)))
}

function diff(pointers1: Pointer[], pointers2: Pointer[]): Set<Pointer> {
  return new Set(pointers1.filter((pointer) => !pointers2.includes(pointer)))
}
