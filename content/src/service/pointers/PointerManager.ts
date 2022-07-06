import { Entity } from '@dcl/schemas'
import { DeploymentId, DeploymentsRepository } from '../../repository/extensions/DeploymentsRepository'
import { LastDeployedPointersRepository } from '../../repository/extensions/LastDeployedPointersRepository'
import { PointerHistoryRepository } from '../../repository/extensions/PointerHistoryRepository'
import { happenedBefore } from '../time/TimeSorting'

/**
 * Manage all pointer data
 */
export class PointerManager {
  /**
   * Commit a new entity, and return the 'before & after' generated by the deployment
   */
  async referenceEntityFromPointers(
    lastDeployedPointersRepo: LastDeployedPointersRepository,
    deploymentsRepo: DeploymentsRepository,
    deploymentId: DeploymentId,
    entity: Entity,
    overwrote: Set<number>
  ): Promise<DeploymentResult> {
    // Fetch active last deployments on pointers
    const lastDeployments = await lastDeployedPointersRepo.getLastActiveDeploymentsOnPointers(
      entity.type,
      entity.pointers
    )

    const resultMariano: DeploymentResult = new Map()
    try {
      const lastDeployments2 = await deploymentsRepo.getLastActiveDeploymentsOnPointers(
        deploymentId,
        entity.type,
        entity.pointers
      )
      console.log(`MARIANO(${deploymentId}): lastDeployments`, lastDeployments)
      if (JSON.stringify(lastDeployments) !== JSON.stringify(lastDeployments2)) {
        console.log(`MARIANO(${deploymentId}): lastDeployments are different: `, lastDeployments2)
      }

      const overwrittenDeployments = await deploymentsRepo.getDeployments(overwrote)
      for (const pointer of entity.pointers) {
        resultMariano.set(pointer, {
          before: overwrittenDeployments.find((dep) => dep.pointers.includes(pointer))?.id,
          after: DELTA_POINTER_RESULT.SET
        })
      }
      for (const dep of overwrittenDeployments) {
        for (const pointer of dep.pointers) {
          if (!resultMariano.has(pointer)) {
            resultMariano.set(pointer, {
              before: dep.id,
              after: DELTA_POINTER_RESULT.CLEARED
            })
          }
        }
      }
    } catch (e) {
      console.log(`MARIANO(${deploymentId}): ERROR`, e)
    }

    // Add a made up deployments for the pointers where there was no deployment yet
    const pointersWithDeployments = lastDeployments
      .map((deployment) => deployment.pointers)
      .reduce((accum, curr) => accum.concat(curr), [])
    console.log(`MARIANO(${deploymentId}): pointersWithDeployments`, pointersWithDeployments)
    const pointersWithoutDeployments = diff(entity.pointers, pointersWithDeployments)
    console.log(`MARIANO(${deploymentId}): pointersWithoutDeployments`, pointersWithoutDeployments)
    if (pointersWithoutDeployments.size > 0) {
      lastDeployments.push({
        entityId: 'NOT_GONNA_BE_USED',
        deployment: 0,
        timestamp: -1,
        pointers: Array.from(pointersWithoutDeployments.values()),
        deleted: true
      })
      console.log(`MARIANO(${deploymentId}): lastDeployments after`, lastDeployments)
    }

    // Determine if the entity being deployed will become active
    const willDeploymentBecomeActive = lastDeployments.every((lastDeployment) => happenedBefore(lastDeployment, entity))

    // Prepare variables
    const result: DeploymentResult = new Map()
    const overwrite: Set<string> = new Set()

    lastDeployments.forEach((lastDeployment) => {
      // Calculate the intersection of pointers between the last deployment and the new one
      const intersection: Set<string> = intersect(lastDeployment.pointers, entity.pointers)

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
          const onlyOnLastDeployed: Set<string> = diff(lastDeployment.pointers, entity.pointers)
          onlyOnLastDeployed.forEach((pointer) =>
            result.set(pointer, { before: lastDeployment.deployment, after: DELTA_POINTER_RESULT.CLEARED })
          )
        }
      }
    })

    console.log(`MARIANO(${deploymentId}): overwrite`, Array.from(overwrite.values()))

    // Overwrite the currently last entities that need to be overwritten
    await lastDeployedPointersRepo.setAsLastActiveDeploymentsOnPointers(
      deploymentId,
      entity.type,
      Array.from(overwrite.values())
    )

    console.log(`MARIANO(${deploymentId}): result`, result)
    if (JSON.stringify(result) !== JSON.stringify(resultMariano)) {
      console.log(`MARIANO(${deploymentId}): resultMariano is different: `, resultMariano)
    }

    return result
  }

  calculateOverwrites(
    deploymentsRepo: DeploymentsRepository,
    entity: Entity
  ): Promise<{ overwrote: Set<DeploymentId>; overwrittenBy: DeploymentId | null }> {
    return deploymentsRepo.calculateOverwrites(entity)
  }

  addToHistory(pointerHistoryRepo: PointerHistoryRepository, deploymentId: DeploymentId, entity: Entity) {
    return pointerHistoryRepo.addToHistory(deploymentId, entity)
  }
}

export type DeploymentResult = Map<string, { before: DeploymentId | undefined; after: DELTA_POINTER_RESULT }>

export enum DELTA_POINTER_RESULT {
  SET = 'set',
  CLEARED = 'cleared'
}

function intersect(pointers1: string[], pointers2: string[]): Set<string> {
  return new Set(pointers1.filter((pointer) => pointers2.includes(pointer)))
}

function diff(pointers1: string[], pointers2: string[]): Set<string> {
  return new Set(pointers1.filter((pointer) => !pointers2.includes(pointer)))
}
