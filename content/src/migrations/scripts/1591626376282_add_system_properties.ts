import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('system_properties', {
    key: { type: 'text', primaryKey: true },
    value: { type: 'text', notNull: true }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('system_properties')
}
