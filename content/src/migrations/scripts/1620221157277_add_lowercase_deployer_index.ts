import { MigrationBuilder } from 'node-pg-migrate'

/*
  In this migration, we are creating a index in deployments table with the 'entity_timestamp' and 'entity_id' columns
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`CREATE INDEX deployer_address_lower_case on deployments (LOWER(deployer_address) text_pattern_ops);`)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX deployer_address_lower_case;`)
}
