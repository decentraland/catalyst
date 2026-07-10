/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Staging area for partial (multi-request) deployments: an entity's content is uploaded across
  // several POST /entities requests and lives here until every referenced file is present, at which
  // point the row is deleted and the entity is deployed for real into `deployments`/`active_pointers`.
  // This table is intentionally invisible to every sync/replication read path (snapshots,
  // /pointer-changes, batchDeployer) — those only read `deployments`.
  pgm.createTable('pending_deployments', {
    entity_id: { type: 'text', primaryKey: true },
    entity_type: { type: 'text', notNull: true },
    pointers: { type: 'text[]', notNull: true },
    content_hashes: { type: 'text[]', notNull: true },
    deployer_address: { type: 'text', notNull: true },
    // The entity's own timestamp (deployment ordering). Overlapping pending uploads resolve by this so
    // the single per-parcel-set slot goes to the newest scene, not merely the last writer.
    entity_timestamp: { type: 'bigint', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  })

  // GIN on pointers backs the `pointers && $1` overlap query used to enforce "at most one pending
  // deployment per parcel set" (a new partial deploy replaces overlapping ones).
  pgm.sql('CREATE INDEX pending_deployments_pointers_gin_idx ON pending_deployments USING GIN (pointers)')
  // GIN on content_hashes backs the garbage-collection referenced-hash check (`content_hashes && $1`).
  pgm.sql('CREATE INDEX pending_deployments_content_hashes_gin_idx ON pending_deployments USING GIN (content_hashes)')
  // B-tree on created_at backs expiry filters/deletes.
  pgm.createIndex('pending_deployments', 'created_at', {
    name: 'pending_deployments_created_at_idx',
    ifNotExists: true
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('pending_deployments')
}
