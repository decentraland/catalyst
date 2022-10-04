import { EntityType } from '@dcl/schemas'
import { MigrationBuilder } from 'node-pg-migrate'
import { FailureReason } from '../ports/failedDeployments'

export function deleteFailedDeployments(pgm: MigrationBuilder, ...entityIds: string[]): void {
  const inClause = entityIds.map((entityId) => `'${entityId}'`).join(',')
  pgm.sql(`DELETE FROM failed_deployments WHERE entity_id IN (${inClause})`)
}

const SUPPORTED_TYPES = [EntityType.WEARABLE] // This has only been tested on wearables

/**
 * It is extremely hard to re-write history, so the idea is to delete all relevant history and re-deploy these deployments. We will only
 * do this if the affected deployments are mono-pointer. This is because handling deployments with multiple pointers is way harder.
 * We will:
 * - Take a list of pointers
 * - Check that all deployments in those pointers are mono-pointer
 * - Move these deployments to failed-deployments
 * - Delete these deployments from all other tables on the database
 *
 * Then, deployments should be manually 'fixed' and everything will go back to normal. Ideally, in the future there will be a way for the content
 * server to auto-fix its own failed deployments, but that has to be done manually for now.
 */
export async function considerDeploymentsOnPointersAsFailed(
  pgm: MigrationBuilder,
  entityType: EntityType,
  ...pointers: string[]
): Promise<void> {
  if (!SUPPORTED_TYPES.includes(entityType)) {
    throw new Error(`${entityType} is not supported right now`)
  }
  for (const pointer of pointers) {
    await considerDeploymentsOnPointerAsFailed(pgm, entityType, pointer)
  }
}

async function considerDeploymentsOnPointerAsFailed(pgm: MigrationBuilder, entityType: EntityType, pointer: string) {
  const now = Date.now()
  const { rows } = await pgm.db.query(`
    SELECT id, entity_id, entity_pointers
    FROM deployments
    WHERE entity_type='${entityType}' AND entity_pointers && ARRAY['${pointer}']
    ORDER BY entity_timestamp ASC
    `)

  const areAllDeploymentsMonoPointer = rows.every((row) => row.entity_pointers.length === 1)
  if (!areAllDeploymentsMonoPointer) {
    throw new Error(`All entities should be mono-pointer, but found some that weren't`)
  }

  for (const row of rows) {
    const reason = FailureReason.DEPLOYMENT_ERROR
    const description = 'Moved to failed deployments by database migration'

    // Send to failed deployments
    await pgm.db.query(`
      INSERT INTO failed_deployments (
        entity_type,
        entity_id,
        failure_timestamp,
        reason,
        error_description
      ) VALUES ('${entityType}', '${row.entity_id}', to_timestamp(${now} / 1000.0), '${reason}', '${description}')
      ON CONFLICT ON CONSTRAINT failed_deployments_uniq_entity_id_entity_type
      DO UPDATE SET failure_timestamp = to_timestamp(${now} / 1000.0), reason = '${reason}', error_description = '${description}'`)

    // Delete from all tables
    await pgm.db.query(`DELETE FROM last_deployed_pointers WHERE deployment=${row.id}`)
    await pgm.db.query(`DELETE FROM pointer_history WHERE deployment=${row.id}`)
    await pgm.db.query(`DELETE FROM content_files WHERE deployment=${row.id}`)
    await pgm.db.query(`DELETE FROM deployment_deltas WHERE deployment=${row.id}`)
    await pgm.db.query(`DELETE FROM deployments WHERE id=${row.id}`)
  }
}
