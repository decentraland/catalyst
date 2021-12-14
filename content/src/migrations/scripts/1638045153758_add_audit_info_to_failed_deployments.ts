import { MigrationBuilder } from 'node-pg-migrate'

/*
 * Add an auth_chain field to failed deployments to prevent hitting other catalysts during synchronization.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('failed_deployments', {
    auth_chain: { type: 'json', notNull: false }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('failed_deployments', 'auth_chain')
}
