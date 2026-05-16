import { Entity } from '@dcl/schemas'
import { DatabaseClient } from '../../adapters/database'
import { IDeploymentsRepository } from '../../adapters/deployments-repository'
import { DeploymentId } from '../../types'

/** Pointer-state delta produced by deploying an entity. */
export type PointerDeltaMap = Map<string, { before: DeploymentId | undefined; after: DELTA_POINTER_RESULT }>

export enum DELTA_POINTER_RESULT {
  SET = 'set',
  CLEARED = 'cleared'
}

/**
 * Manage all pointer data.
 *
 * Owns the bookkeeping that maps active entity pointers to the deployments that currently
 * back them. Called from the deployment-service while a deploy transaction is open, so
 * the DB client is threaded in per call to honor the WKC repository rule (logic owns
 * transactions; repos take a `DatabaseClient` per call).
 *
 * @param deploymentsRepository - the repository used to look up overwritten deployments
 * @param database - DB client; pass the active transaction client when called inside a deploy tx
 * @param entity - the entity being deployed
 * @param overwrittenDeploymentIds - ids of previously existing deployments being overwritten by this deployment
 * @param isEntityOverwrittenByAnExistingDeployment - whether the current deployment is old and has already been overwritten by a newer one
 *
 * @returns A map keyed by pointer with `before` (the previous deployment id, if any) and `after` (`'set'` or `'cleared'`).
 */
export async function referenceEntityFromPointers(
  deploymentsRepository: IDeploymentsRepository,
  database: DatabaseClient,
  entity: Entity,
  overwrittenDeploymentIds: Set<number>,
  isEntityOverwrittenByAnExistingDeployment: boolean
): Promise<PointerDeltaMap> {
  const result: PointerDeltaMap = new Map()

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
