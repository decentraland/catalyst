import { MigrationBuilder } from 'node-pg-migrate'

export async function up(_pgm: MigrationBuilder): Promise<void> {
  // pgm.dropTable('last_deployed_pointers')
}

export async function down(_pgm: MigrationBuilder): Promise<void> {
  // pgm.createTable(
  //   'last_deployed_pointers',
  //   {
  //     pointer: { type: 'text', notNull: true },
  //     entity_type: { type: 'text', notNull: true },
  //     deployment: { type: 'integer', references: 'deployments', notNull: true }
  //   },
  //   {
  //     constraints: {
  //       unique: ['pointer', 'entity_type']
  //     }
  //   }
  // )
}
