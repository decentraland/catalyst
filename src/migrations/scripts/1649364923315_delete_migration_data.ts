import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('migration_data')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    'migration_data',
    {
      deployment: { type: 'integer', references: 'deployments', notNull: true },
      original_metadata: { type: 'json', notNull: true }
    },
    {
      constraints: {
        unique: ['deployment']
      }
    }
  )
}
