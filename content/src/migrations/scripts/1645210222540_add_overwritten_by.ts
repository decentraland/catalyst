import { MigrationBuilder } from 'node-pg-migrate'

/*
 * Fix the index of deployments used when getting snapshots
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE deployments ADD COLUMN overwritten_by text DEFAULT NULL;`)
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
