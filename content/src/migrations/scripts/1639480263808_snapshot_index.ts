import { MigrationBuilder } from 'node-pg-migrate'

/*
 * Fix the index of deployments used when getting snapshots
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS
      deployments_full_snapshots_ix
    ON deployments (
      deleter_deployment DESC NULLS FIRST,
      local_timestamp ASC NULLS LAST
    )
    INCLUDE (entity_type)
  `)
  pgm.dropIndex('deployments', 'deleter_deployment')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP INDEX IF EXISTS deployments_full_snapshots_ix')
  pgm.addIndex('deployments', 'deleter_deployment')
}
