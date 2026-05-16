import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('deployment_deltas')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    'deployment_deltas',
    {
      deployment: { type: 'integer', references: 'deployments', notNull: true },
      pointer: { type: 'text', notNull: true },
      before: { type: 'integer', references: 'deployments', notNull: false },
      after: { type: 'delta_pointer_result', notNull: true }
    },
    {
      constraints: {
        unique: ['deployment', 'pointer']
      }
    }
  )
}
