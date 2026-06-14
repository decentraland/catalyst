/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

const MATERIALIZED_VIEW = 'active_third_party_collection_items_deployments_with_content'
const INDEX_NAME = 'active_third_party_collection_items_deployments_with_content_entity_id_idx'

export async function up(pgm: MigrationBuilder): Promise<void> {
  // getDeploymentsForActiveThirdPartyItemsByEntityIds filters this materialized view by
  // `entity_id = ANY(...)`, but the view only had indexes on deployment_id and pointer, so each
  // lookup sequentially scanned the whole view. Index entity_id so those lookups are index-backed.
  pgm.sql(`CREATE INDEX IF NOT EXISTS ${INDEX_NAME} ON ${MATERIALIZED_VIEW} (entity_id);`)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX IF EXISTS ${INDEX_NAME};`)
}
