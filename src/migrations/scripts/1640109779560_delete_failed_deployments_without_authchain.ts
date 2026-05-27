import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DELETE FROM failed_deployments WHERE auth_chain IS NULL')
  pgm.alterColumn('failed_deployments', 'auth_chain', { notNull: true })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.alterColumn('failed_deployments', 'auth_chain', { notNull: false })
}
