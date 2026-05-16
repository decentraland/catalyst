import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('denylist')
  pgm.dropTable('denylist_history')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  /** Denylist */
  pgm.createTable(
    'denylist',
    {
      target_type: { type: 'text', notNull: true },
      target_id: { type: 'text', notNull: true }
    },
    {
      constraints: {
        unique: ['target_id', 'target_type']
      }
    }
  )

  /** Denylist history */
  pgm.createTable(
    'denylist_history',
    {
      target_type: { type: 'text', notNull: true },
      target_id: { type: 'text', notNull: true },
      timestamp: { type: 'timestamp', notNull: true },
      auth_chain: { type: 'json', notNull: true },
      action: { type: 'text', notNull: true }
    },
    {
      constraints: {
        unique: ['target_id', 'target_type', 'timestamp']
      }
    }
  )
}
