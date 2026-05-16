import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('last_deployed_pointers', { ifExists: true })
  pgm.dropTable('pointer_history', { ifExists: true })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    'last_deployed_pointers',
    {
      pointer: { type: 'text', notNull: true },
      entity_type: { type: 'text', notNull: true },
      deployment: { type: 'integer', references: 'deployments', notNull: true }
    },
    {
      constraints: {
        unique: ['pointer', 'entity_type']
      }
    }
  )
  pgm.createTable(
    'pointer_history',
    {
      pointer: { type: 'text', notNull: true },
      entity_type: { type: 'text', notNull: true },
      deployment: { type: 'integer', references: 'deployments', notNull: true }
    },
    {
      constraints: {
        unique: ['pointer', 'entity_type', 'deployment']
      }
    }
  )
}
