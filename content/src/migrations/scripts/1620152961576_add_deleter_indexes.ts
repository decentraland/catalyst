import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addIndex('deployments', 'deleter_deployment')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('deployments', 'deleter_deployment')
}
