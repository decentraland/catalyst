import { MigrationBuilder } from 'node-pg-migrate'

/*
  In this migration, we are creating a index in deployments table with the 'entity_timestamp' and 'entity_id' columns
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS deployments_entity_timestamp_entity_id_idx ON deployments USING btree ( entity_timestamp DESC, entity_id DESC )`
  )
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX IF EXISTS deployments_entity_timestamp_entity_id_idx`)
}
