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
  const { rows } = await pgm.db.query(
    `SELECT id, entity_pointers, deleter_deployment FROM deployments WHERE entity_id="${entityId}"`
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

  const overwrittenByEntity = await findOverwrittenBy(pgm, id)

  // Re-write overwrite history
  if (overwrittenByEntity) {
    pgm.sql(`UPDATE deployment_deltas SET before=${overwrittenByEntity} WHERE deployment=${deleter_deployment}`)
    pgm.sql(`UPDATE deployments SET deleter_deployment=${deleter_deployment} WHERE id=${overwrittenByEntity}`)
  } else {
    pgm.sql(`UPDATE deployment_deltas SET before=NULL WHERE deployment=${deleter_deployment}`)
  }

  // Delete from tables
  pgm.sql(`DELETE FROM pointer_history WHERE deployment=${id}`)
  pgm.sql(`DELETE FROM content_files WHERE deployment=${id}`)
  pgm.sql(`DELETE FROM migration_data WHERE deployment=${id}`)
  pgm.sql(`DELETE FROM deployment_deltas WHERE deployment=${id}`)
  pgm.sql(`DELETE FROM deployments WHERE id=${id}`)
}
/**
 * Given a deployment id, finds the deployment that was overwritten by it. If there isn't any, returns undefined
 * Note: only returns the first deployment that was overwritten, because it's meant to be used for entities with only one pointer.
 */
async function findOverwrittenBy(pgm: MigrationBuilder, deploymentId: number): Promise<number | undefined> {
  const { rows } = await pgm.db.query(`SELECT id FROM deployments WHERE deleter_deployment=${deploymentId}`)
  return rows[0]?.id
}
