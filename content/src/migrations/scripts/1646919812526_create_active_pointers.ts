import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('active_pointers', {
    pointer: { type: 'text', primaryKey: true },
    entity_id: { type: 'text', notNull: true }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('active_pointers')
}
