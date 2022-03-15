import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('active_pointers', {
    pointer: { type: 'text', primaryKey: true },
    entity_id: { type: 'text', notNull: true }
  })

  pgm.sql(`
    INSERT INTO active_pointers (pointer, entity_id)
    SELECT UNNEST(entity_pointers) as pointer, entity_id
    FROM deployments
    WHERE deleter_deployment IS NULL;
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('active_pointers')
}
