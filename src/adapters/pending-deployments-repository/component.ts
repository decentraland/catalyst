import SQL from 'sql-template-strings'
import { DatabaseClient } from '../../adapters/database'
import {
  IPendingDeploymentsRepository,
  OverlappingPendingDeployment,
  PendingDeploymentRow,
  UpsertPendingDeployment
} from './types'

async function acquireStagingLocks(
  database: DatabaseClient,
  pointers: string[],
  deployerAddress: string
): Promise<void> {
  // Serialize only the staging requests that actually contend, instead of all of them on one global
  // lock. Two transaction-scoped advisory locks, always in this order (a consistent global acquisition
  // order → deadlock-free):
  // 1. Per-deployer: serializes a single deployer's concurrent staging so the per-deployer cap can't be
  //    raced. Different deployers never contend here.
  await database.queryWithValues(
    SQL`SELECT pg_advisory_xact_lock(hashtextextended(${'pending_deployer:' + deployerAddress.toLowerCase()}, 0))`,
    'pending_deployment_deployer_lock'
  )
  // 2. Per-pointer, taken in sorted order: serializes exactly the uploads whose pointer sets overlap
  //    (protecting the "reject-newer / replace-overlapping" critical section) while letting uploads on
  //    disjoint pointers run concurrently. Sorting guarantees any two requests acquire shared pointer
  //    locks in the same order, so they can't deadlock.
  if (pointers.length > 0) {
    await database.queryWithValues(
      SQL`SELECT pg_advisory_xact_lock(hashtextextended('pending_pointer:' || p, 0))
          FROM unnest(${pointers}::text[]) AS p
          ORDER BY p`,
      'pending_deployment_pointer_locks'
    )
  }
}

interface PendingDeploymentDbRow {
  entity_id: string
  entity_type: string
  pointers: string[]
  content_hashes: string[]
  deployer_address: string
  entity_timestamp: string
  created_at: Date
  updated_at: Date
}

function toRow(row: PendingDeploymentDbRow): PendingDeploymentRow {
  return {
    entityId: row.entity_id,
    entityType: row.entity_type as PendingDeploymentRow['entityType'],
    pointers: row.pointers,
    contentHashes: row.content_hashes,
    deployerAddress: row.deployer_address,
    // bigint columns come back as strings from node-pg.
    entityTimestamp: parseInt(row.entity_timestamp, 10),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

async function getByEntityId(database: DatabaseClient, entityId: string): Promise<PendingDeploymentRow | undefined> {
  const result = await database.queryWithValues<PendingDeploymentDbRow>(
    SQL`SELECT entity_id, entity_type, pointers, content_hashes, deployer_address, entity_timestamp, created_at, updated_at
        FROM pending_deployments
        WHERE entity_id = ${entityId}
        LIMIT 1`,
    'pending_deployment_by_id'
  )
  if (result.rowCount > 0) {
    return toRow(result.rows[0])
  }
  return undefined
}

async function upsert(database: DatabaseClient, row: UpsertPendingDeployment, ttlMs: number): Promise<void> {
  // ON CONFLICT bumps `updated_at` and keeps `created_at` STABLE while the row is within its TTL:
  // `created_at` is the deployment-TTL anchor, so resuming an upload must never extend the window.
  // An EXPIRED row is the exception — it is dead state (its content is GC-eligible and reads treat it
  // as absent), so re-staging the same entity resets `created_at` to now, starting a fresh window
  // instead of resurrecting a permanently-expired anchor. entity_id is content-addressed, so the other
  // columns are immutable for a given id anyway.
  const cutoff = Date.now() - ttlMs
  await database.queryWithValues(
    SQL`INSERT INTO pending_deployments
          (entity_id, entity_type, pointers, content_hashes, deployer_address, entity_timestamp, created_at, updated_at)
        VALUES
          (${row.entityId}, ${row.entityType}, ${row.pointers}, ${row.contentHashes}, ${row.deployerAddress}, ${row.entityTimestamp}, now(), now())
        ON CONFLICT (entity_id) DO UPDATE SET
          updated_at = now(),
          created_at = CASE
            WHEN pending_deployments.created_at < to_timestamp(${cutoff} / 1000.0) THEN now()
            ELSE pending_deployments.created_at
          END`,
    'pending_deployment_upsert'
  )
}

async function deleteByEntityId(database: DatabaseClient, entityId: string): Promise<void> {
  await database.queryWithValues(
    SQL`DELETE FROM pending_deployments WHERE entity_id = ${entityId}`,
    'pending_deployment_delete'
  )
}

async function getOverlappingPointers(
  database: DatabaseClient,
  pointers: string[],
  excludeEntityId: string,
  ttlMs: number
): Promise<OverlappingPendingDeployment[]> {
  if (pointers.length === 0) {
    return []
  }
  // Expired rows are dead state (every other read treats them as absent), so they must not surface
  // here either — an expired overlapping upload must never cause a newer-conflict rejection.
  const cutoff = Date.now() - ttlMs
  const result = await database.queryWithValues<{ entity_id: string; entity_timestamp: string }>(
    SQL`SELECT entity_id, entity_timestamp
        FROM pending_deployments
        WHERE pointers && ${pointers}
          AND entity_id <> ${excludeEntityId}
          AND created_at > to_timestamp(${cutoff} / 1000.0)`,
    'pending_deployment_get_overlapping'
  )
  return result.rows.map((r) => ({ entityId: r.entity_id, entityTimestamp: parseInt(r.entity_timestamp, 10) }))
}

async function deleteOverlappingPointers(
  database: DatabaseClient,
  pointers: string[],
  excludeEntityId: string,
  onlyDeployer?: string
): Promise<string[]> {
  if (pointers.length === 0) {
    return []
  }
  // `onlyDeployer` restricts the destructive replace to the caller's OWN pending rows. Used on the
  // resume fast path, which skips the (slow) access check: without the restriction, a deployer who has
  // since lost access to these pointers could still evict a DIFFERENT deployer's freshly-staged upload.
  // A cross-deployer newest-wins replacement only happens on a request that ran the full access check.
  const query = SQL`DELETE FROM pending_deployments WHERE pointers && ${pointers} AND entity_id <> ${excludeEntityId}`
  if (onlyDeployer !== undefined) {
    query.append(SQL` AND LOWER(deployer_address) = ${onlyDeployer.toLowerCase()}`)
  }
  query.append(SQL` RETURNING entity_id`)
  const result = await database.queryWithValues<{ entity_id: string }>(query, 'pending_deployment_delete_overlapping')
  return result.rows.map((r) => r.entity_id)
}

async function countActiveByDeployer(
  database: DatabaseClient,
  deployerAddress: string,
  ttlMs: number,
  excludeEntityId: string
): Promise<number> {
  const cutoff = Date.now() - ttlMs
  const result = await database.queryWithValues<{ count: string }>(
    SQL`SELECT COUNT(*) AS count FROM pending_deployments
        WHERE LOWER(deployer_address) = ${deployerAddress.toLowerCase()}
          AND created_at > to_timestamp(${cutoff} / 1000.0)
          AND entity_id <> ${excludeEntityId}`,
    'pending_deployment_count_by_deployer'
  )
  return parseInt(result.rows[0].count, 10)
}

async function deleteExpired(database: DatabaseClient, ttlMs: number): Promise<number> {
  const cutoff = Date.now() - ttlMs
  const result = await database.queryWithValues(
    SQL`DELETE FROM pending_deployments WHERE created_at < to_timestamp(${cutoff} / 1000.0)`,
    'pending_deployment_delete_expired'
  )
  return result.rowCount
}

async function* streamAllNonExpiredHashes(
  database: DatabaseClient,
  ttlMs: number,
  options?: { batchSize?: number }
): AsyncIterable<string> {
  const cutoff = Date.now() - ttlMs
  const query = SQL`
    SELECT entity_id AS hash FROM pending_deployments WHERE created_at > to_timestamp(${cutoff} / 1000.0)
    UNION
    SELECT unnest(content_hashes) AS hash FROM pending_deployments WHERE created_at > to_timestamp(${cutoff} / 1000.0)
  `
  for await (const row of database.streamQuery<{ hash: string }>(
    query,
    { batchSize: options?.batchSize ?? 1000 },
    'pending_deployment_stream_hashes'
  )) {
    yield row.hash
  }
}

export function createPendingDeploymentsRepository(): IPendingDeploymentsRepository {
  return {
    getByEntityId,
    upsert,
    deleteByEntityId,
    getOverlappingPointers,
    deleteOverlappingPointers,
    countActiveByDeployer,
    deleteExpired,
    streamAllNonExpiredHashes,
    acquireStagingLocks
  }
}
