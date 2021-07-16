import { EntityId } from 'dcl-catalyst-commons'
import { MigrationBuilder } from 'node-pg-migrate'

export function deleteFailedDeployments(pgm: MigrationBuilder, ...entityIds: EntityId[]) {
  const inClause = entityIds.map((entityId) => `'${entityId}'`).join(',')
  pgm.sql(`DELETE FROM failed_deployments WHERE entity_id IN (${inClause})`)
}

export async function deleteInactiveDeploymentsFromHistory(
  pgm: MigrationBuilder,
  ...entityIds: EntityId[]
): Promise<void> {
  for (const entityId of entityIds) {
    await deleteInactiveDeploymentFromHistory(pgm, entityId)
  }
}

async function deleteInactiveDeploymentFromHistory(pgm: MigrationBuilder, entityId: EntityId) {
  /*
   There are two kind of histories that we need to modify here.

   -  Entities/global history:
      This is the global history that all content server agree on. This is determined by the entity timestamp, which can't be modified,
      so all content server should have the same order and agree on 'who overwrote who'. This overwrite information is stored
      on the 'deployments' table, with the 'deleter_deployment' field. Each deployment will store who overwrote it (in this global order sense).

   -  Deployments/local history:
      This history is local to each content server. It depends on the order that deployments were made, so it will most likely be different for
      each server. This information is stored on the 'deployment_deltas' table, and exposed by the /pointer-changes endpoint. The idea is that
      this table will store changes made to the pointers. So if a deployment modifies a pointer in some way, this is where it will be recorded.
      Possible modifications to a pointer could be: making the pointer reference the new entity or making the pointer point to nothing. Each
      deployment will have a reference:
      - The modified pointer
      - The previous entity the pointer was referring to (if any)
      - The changes that ocurred (point to new entity or point to nothing).
      It is important to note that a new deployment could have no impact on pointers. This would happen when D1 overwrote D2 (on the global order sense),
      and the content server locally deployed D1 before D2. In that case, no changes are recorded for that deployment.
  */
  const { rows } = await pgm.db.query(
    `SELECT id, entity_pointers, deleter_deployment FROM deployments WHERE entity_id='${entityId}'`
  )
  if (rows.length === 0) {
    // Nothing to do if there is no deployment with that entity id
    return
  } else if (rows.length > 1) {
    throw new Error(`Expected to find one deployment with entity id '${entityId}"'. Instead found ${rows.length}`)
  }

  const { id, entity_pointers, deleter_deployment } = rows[0]

  if (!deleter_deployment) {
    throw new Error('This script only works with entities that have been overwritten')
  }

  if (entity_pointers.length !== 1) {
    throw new Error(
      'This script only works with entities with only one pointer. Re-writing history for entities with more pointers is a lot harder'
    )
  }

  // Re-write global history
  const overwrittenByEntity = await findOverwrittenByDeployment(pgm, id)
  if (overwrittenByEntity) {
    // We know that the deployment being deleted (DBD) was overwritten by deleter_deployment, since that is a requirement for this script.
    // Now, if DBD overwrote a previous deployment (overwrittenByEntity), we will mark that overwrittenByEntity was actually overwritten
    // by deleter_deployment, and remove DBD from the equation.
    await pgm.db.query(
      `UPDATE deployments SET deleter_deployment=${deleter_deployment} WHERE id=${overwrittenByEntity}`
    )
  }

  // Re-write local history
  const madeInactiveBy = await findMadeInactiveBy(pgm, id)
  if (madeInactiveBy) {
    // If the deployment being deleted (DBD) was made inactive by a posterior deployment (PD), we will try to find if DBD did the same
    // to a previous deployment (PRD). If that is the case, we will mark that it was actually PD who made PRD inactive, and remove DBD
    // from the equation. If there is no PRD, then we will simply set that PD didn't affect any deployments.
    const { rows } = await pgm.db.query(`SELECT before FROM deployment_deltas WHERE deployment=${id}`)
    const before = rows[0]?.before
    if (before) {
      await pgm.db.query(`UPDATE deployment_deltas SET before=${before} WHERE deployment=${madeInactiveBy}`)
    } else {
      await pgm.db.query(`UPDATE deployment_deltas SET before=NULL WHERE deployment=${madeInactiveBy}`)
    }
  }

  // Delete from tables
  await pgm.db.query(`DELETE FROM pointer_history WHERE deployment=${id}`)
  await pgm.db.query(`DELETE FROM content_files WHERE deployment=${id}`)
  await pgm.db.query(`DELETE FROM migration_data WHERE deployment=${id}`)
  await pgm.db.query(`DELETE FROM deployment_deltas WHERE deployment=${id}`)
  await pgm.db.query(`DELETE FROM deployments WHERE id=${id}`)
}
/**
 * Given a deployment id, finds the deployment that was overwritten by it. If there isn't any, returns undefined. Remember that this value
 * should be the same across all synced content servers, since this type of overwrites are calculated by entity timestamp.
 * Note: only returns the first deployment that was overwritten, because it's meant to be used for entities with only one pointer.
 */
async function findOverwrittenByDeployment(pgm: MigrationBuilder, deploymentId: number): Promise<number | undefined> {
  const { rows } = await pgm.db.query(`SELECT id FROM deployments WHERE deleter_deployment=${deploymentId}`)
  return rows[0]?.id
}

/**
 * Given a deployment id finds the deployment that stopped the given deployment from being active.
 * It is important to notice that it could happen that the given deployment was never active. This would happen when
 * D1 overwrote D2, and the content server deployed D1 before D2. In that case, this function returns undefined.
 */
async function findMadeInactiveBy(pgm: MigrationBuilder, deploymentId: number): Promise<number | undefined> {
  const { rows } = await pgm.db.query(`SELECT deployment FROM deployment_deltas WHERE before=${deploymentId}`)
  return rows[0]?.deployment
}
