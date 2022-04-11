import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('failed_deployments')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    'failed_deployments',
    {
      entity_type: { type: 'text', notNull: true },
      entity_id: { type: 'text', notNull: true },
      origin_server_url: { type: 'text', notNull: true },
      origin_timestamp: { type: 'timestamp', notNull: true },
      failure_timestamp: { type: 'timestamp', notNull: true },
      reason: { type: 'text', notNull: true },
      error_description: { type: 'text', notNull: false }
    },
    {
      constraints: {
        unique: ['entity_id', 'entity_type']
      }
    }
  )
}
