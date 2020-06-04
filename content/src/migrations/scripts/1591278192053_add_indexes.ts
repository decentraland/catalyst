import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
    pgm.addIndex('deployments', 'entity_type')
    pgm.addIndex('deployments', 'entity_pointers', { method: 'gin' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
    pgm.dropIndex('deployments', 'entity_pointers')
    pgm.dropIndex('deployments', 'entity_type')
}
