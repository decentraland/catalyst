import { MigrationBuilder } from 'node-pg-migrate'

/*
 * Fix the index of deployments used when getting snapshots
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE deployments ADD COLUMN overwritten_by text DEFAULT NULL;`)

  // pgm.sql(`ALTER TABLE deployments DROP CONSTRAINT id;`)
  // pgm.sql(`ALTER TABLE deployments ADD PRIMARY KEY (entity_id);`)

  // pgm.sql(`ALTER TABLE content_files ADD COLUMN entity_id text NOT NULL;`)
  // pgm.sql(`ALTER TABLE migration_data ADD COLUMN entity_id text NOT NULL;`)

  // pgm.sql(`
  //   UPDATE deployments
  //   SET
  //       overwritten_by = new_value1
  //   WHERE
  //       deleter_deployment IS NOT NULL;
  // `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE deployments DROP COLUMN IF EXISTS overwritten_by ;`)
}
