import { EntityId } from 'dcl-catalyst-commons'
import { MigrationBuilder } from 'node-pg-migrate'

export function deleteFailedDeployments(pgm: MigrationBuilder, ...entityIds: EntityId[]) {
  const inClause = entityIds.map((entityId) => `'${entityId}'`).join(',')
  pgm.sql(`DELETE FROM failed_deployments WHERE entity_id IN (${inClause})`)
}
