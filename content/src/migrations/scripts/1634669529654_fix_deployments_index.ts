import { MigrationBuilder } from 'node-pg-migrate'

/*
  In this migration, we are replacing the current index 'deployments_local_timestamp_idx' with one that used both 'local_timestamp' and 'entity_id' columns
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX IF EXISTS deployments_local_timestamp_entity_id_idx`)
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS deployments_local_timestamp_lower_entity_id_idx ON deployments USING btree ( local_timestamp DESC, LOWER(entity_id) DESC )`
  )
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX IF EXISTS deployments_local_timestamp_lower_entity_id_idx`)
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS deployments_local_timestamp_entity_id_idx ON deployments USING btree ( local_timestamp DESC, entity_id DESC )`
  )
}
