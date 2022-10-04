/* eslint-disable @typescript-eslint/naming-convention */
import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('failed_deployments', {
    entity_id: { type: 'text', notNull: true, primaryKey: true },
    entity_type: { type: 'text', notNull: true },
    failure_time: { type: 'timestamp', notNull: true },
    reason: { type: 'text', notNull: true },
    auth_chain: { type: 'json', notNull: true },
    error_description: { type: 'text', notNull: true },
    snapshot_hash: { type: 'text' }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('failed_deployments')
}
