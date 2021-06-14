import { EntityId } from 'dcl-catalyst-commons'
import { MigrationBuilder } from 'node-pg-migrate'

export function deleteFailedDeployments(pgm: MigrationBuilder, ...entityIds: EntityId[]) {
  const inClause = entityIds.map((entityId) => `'${entityId}'`).join(',')
  pgm.sql(`DELETE FROM deployments WHERE entityId IN (${inClause})`)
}
