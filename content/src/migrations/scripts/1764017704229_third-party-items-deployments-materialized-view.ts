import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createMaterializedView(
    'active_third_party_collection_items_deployments_with_content',
    {
      ifNotExists: true
    },
    `SELECT
      ap.pointer,
      ap.entity_id,
      d.id as deployment_id,
      d.entity_type,
      d.entity_pointers,
      date_part('epoch', d.entity_timestamp) * 1000 AS entity_timestamp,
      d.entity_metadata,
      d.deployer_address,
      d.version,
      d.auth_chain,
      date_part('epoch', d.local_timestamp) * 1000 AS local_timestamp,
      COALESCE(cf_agg.content_hashes, '{}') as content_hashes,
      COALESCE(cf_agg.content_keys, '{}') as content_keys
    FROM active_pointers ap
    JOIN deployments d ON d.entity_id = ap.entity_id
    LEFT JOIN LATERAL (
      SELECT
        array_agg(content_hash) as content_hashes,
        array_agg(key) as content_keys
      FROM content_files
      WHERE deployment = d.id
    ) cf_agg ON true
    WHERE ap.pointer LIKE 'urn:decentraland:matic:collections-thirdparty:%'
    AND d.deleter_deployment IS NULL
    `
  )

  // Create UNIQUE index first (required for CONCURRENT refresh)
  pgm.sql(`
    CREATE UNIQUE INDEX active_third_party_collection_items_deployments_with_content_id_uniq
    ON active_third_party_collection_items_deployments_with_content (deployment_id);
  `)

  // Create other indexes
  pgm.sql(`
    CREATE INDEX active_third_party_collection_items_deployments_with_content_pointer_ops_idx
    ON active_third_party_collection_items_deployments_with_content (pointer varchar_pattern_ops);
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP MATERIALIZED VIEW IF EXISTS active_third_party_collection_items_deployments_with_content;`)
}
