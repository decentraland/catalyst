/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Staging for partial (multi-request) deployments, keyed by entity id. Invisible to every sync and
  // replication read path (snapshots, /pointer-changes, batchDeployer), which only read `deployments`.
  pgm.createTable('pending_deployments', {
    entity_id: { type: 'text', primaryKey: true },
    entity_type: { type: 'text', notNull: true },
    pointers: { type: 'text[]', notNull: true },
    content_hashes: { type: 'text[]', notNull: true },
    // Stored lowercased.
    deployer_address: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    // True once the initial inventory of already-stored content has been recorded.
    initialized: { type: 'boolean', notNull: true, default: false },
    // Cached sum of pending_deployment_files.size, so admission scans uploads instead of receipts.
    reserved_bytes: { type: 'bigint', notNull: true, default: 0 }
  })
  // Backs the GC referenced-hash check (`content_hashes && $1`).
  pgm.sql('CREATE INDEX pending_deployments_content_hashes_gin_idx ON pending_deployments USING GIN (content_hashes)')
  // Backs expiry sweeps and live-upload filters.
  pgm.createIndex('pending_deployments', 'created_at', { name: 'pending_deployments_created_at_idx' })
  // Backs the per-deployer upload count cap.
  pgm.createIndex('pending_deployments', 'deployer_address', { name: 'pending_deployments_deployer_idx' })

  // Byte reservations per staged file. `stored` separates completed writes and verified reused content
  // from reservations; failed writes stay charged.
  pgm.createTable('pending_deployment_files', {
    entity_id: {
      type: 'text',
      notNull: true,
      references: 'pending_deployments(entity_id)',
      onDelete: 'CASCADE'
    },
    hash: { type: 'text', notNull: true },
    size: { type: 'bigint', notNull: true, check: 'size >= 0' },
    stored: { type: 'boolean', notNull: true, default: false }
  })
  pgm.addConstraint('pending_deployment_files', 'pending_deployment_files_pkey', {
    primaryKey: ['entity_id', 'hash']
  })

  // Per-deployer accepted batch bytes in a fixed one-minute window, retries included.
  pgm.createTable('partial_upload_rates', {
    deployer_address: { type: 'text', primaryKey: true },
    window_started: { type: 'timestamptz', notNull: true },
    bytes: { type: 'bigint', notNull: true }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('partial_upload_rates')
  pgm.dropTable('pending_deployment_files')
  pgm.dropTable('pending_deployments')
}
