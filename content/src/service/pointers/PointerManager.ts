import { Entity } from '@dcl/schemas'
import { getDeployments } from '../../logic/database-queries/deployments-queries'
import { AppComponents, DeploymentId } from '../../types'

/**
 * Manage all pointer data
 */
export class PointerManager {
  /**
   * Commit a new entity, and return the 'before & after' generated by the deployment
   * @param {DeploymentId} deploymentId - the id of the deployment that is taking place
   * @param {Entity} entity - the entity that is being deployed
   * @param {Set<number>} overwrittenDeploymentIds - a set of ids of previously existing deployments that are being overwritten by this deployment
   * @param {boolean} isEntityOverwrittenByAnExistingDeployment - a boolean indicating whether the current deployment is old and has been overwritten by a newer one
   *
   * @returns {DeploymentResult} A map where the keys are pointers and the values are a map with before and after value. Before value is the id of the entity deployed before (or undefined) and after is either 'set' or 'cleared'. For e.g. Map(1) { '0x1728f191d246b5a50af7a9494793af74f449a514' => { before: 5199630, after: 'set' }
   */
  async referenceEntityFromPointers(
    components: Pick<AppComponents, 'database'>,
    deploymentId: DeploymentId,
    entity: Entity,
    overwrittenDeploymentIds: Set<number>,
    isEntityOverwrittenByAnExistingDeployment: boolean
  ): Promise<DeploymentResult> {
    const result: DeploymentResult = new Map()

    if (!isEntityOverwrittenByAnExistingDeployment) {
      // At this point, the current deployment will be become active (as there are no other newer deployments overwriting it)

      // Fetch overwritten deployments from the DB
      const overwrittenDeployments = await getDeployments(components, overwrittenDeploymentIds)

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
}

export type DeploymentResult = Map<string, { before: DeploymentId | undefined; after: DELTA_POINTER_RESULT }>

export enum DELTA_POINTER_RESULT {
  SET = 'set',
  CLEARED = 'cleared'
}
