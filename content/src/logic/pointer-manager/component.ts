import { Entity } from '@dcl/schemas'
import { DatabaseClient } from '../../adapters/database'
import { AppComponents } from '../../types'
import { DELTA_POINTER_RESULT, DeploymentResult, IPointerManager } from './types'

/**
 * Manage all pointer data.
 *
 * Owns the bookkeeping that maps active entity pointers to the deployments that currently
 * back them. Called from the deployment-service while a deploy transaction is open, so
 * the DB client is threaded in per call to honor the WKC repository rule (logic owns
 * transactions; repos take a `DatabaseClient` per call).
 */
export function createPointerManager(components: Pick<AppComponents, 'deploymentsRepository'>): IPointerManager {
  const { deploymentsRepository } = components

  return {
    async referenceEntityFromPointers(
      database: DatabaseClient,
      entity: Entity,
      overwrittenDeploymentIds: Set<number>,
      isEntityOverwrittenByAnExistingDeployment: boolean
    ): Promise<DeploymentResult> {
      const result: DeploymentResult = new Map()

      // The current deployment is already stale (a newer one has overwritten it),
      // so no pointer state changes and we can skip the DB hit.
      if (isEntityOverwrittenByAnExistingDeployment) {
        return result
      }

      const overwrittenDeployments = await deploymentsRepository.getDeployments(database, overwrittenDeploymentIds)

      // First pass: every pointer in the new entity is SET. Its `before` is the
      // overwritten deployment that currently owns this pointer, if any.
      for (const pointer of entity.pointers) {
        result.set(pointer, {
          before: overwrittenDeployments.find((dep) => dep.pointers.includes(pointer))?.id,
          after: DELTA_POINTER_RESULT.SET
        })
      }

      // Second pass: pointers that belonged to overwritten deployments but are not
      // claimed by the new entity become CLEARED. The first-pass `result.has` check
      // ensures a SET decision is never downgraded to CLEARED.
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

      return result
    }
  }
}
