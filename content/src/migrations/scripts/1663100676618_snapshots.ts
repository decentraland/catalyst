/* eslint-disable @typescript-eslint/naming-convention */
import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('snapshots', {
    hash: { type: 'text' },
    init_timestamp: { type: 'timestamp', primaryKey: true, notNull: true },
    end_timestamp: { type: 'timestamp', primaryKey: true, notNull: true },
    replaced_hashes: { type: 'text[]', notNull: true },
    number_of_entities: { type: 'integer', notNull: true },
    generation_time: { type: 'timestamp', notNull: true }
  })

  pgm.createTable('processed_snapshots', {
    hash: { type: 'text', primaryKey: true },
    process_time: { type: 'timestamp', notNull: true }
  })

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
  pgm.dropTable('snapshots')
  pgm.dropTable('processed_snapshots')
  pgm.dropTable('failed_deployments')
}
