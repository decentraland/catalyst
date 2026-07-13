import SQL from 'sql-template-strings'
import { DatabaseClient } from '../../adapters/database'
import {
  IPendingDeploymentsRepository,
  OverlappingPendingDeployment,
  PendingDeploymentRow,
  UpsertPendingDeployment
} from './types'

// Fixed key for the transaction-scoped advisory lock that serializes the "replace overlapping + upsert"
// critical section across staging requests (and processes). An arbitrary distinctive constant chosen
// not to collide with node-pg-migrate's migration lock.
const PENDING_DEPLOYMENTS_ADVISORY_LOCK = 916352745601

// How long a finalization lease is honored before it is considered stale and reclaimable. Must exceed
// a real finalization (full validation + deploy) so a slow-but-alive finalizer isn't pre-empted, while
// a crashed one doesn't wedge the upload for long.
const FINALIZATION_LEASE_TTL_MS = 2 * 60 * 1000 // 2 minutes

async function acquireStagingLock(database: DatabaseClient): Promise<void> {
  await database.queryWithValues(
    SQL`SELECT pg_advisory_xact_lock(${PENDING_DEPLOYMENTS_ADVISORY_LOCK})`,
    'pending_deployment_advisory_lock'
  )
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

async function acquireFinalizationLease(database: DatabaseClient, entityId: string): Promise<boolean> {
  // Atomically flip the row to FINALIZING, but only if it isn't already being finalized by a live
  // lease. The single UPDATE ... RETURNING is the whole critical section (the row lock serializes
  // competing acquirers), so exactly one completing request runs the expensive deploy pipeline; others
  // get `false`. A lease older than the TTL (a crashed finalizer) is reclaimable.
  const staleCutoff = Date.now() - FINALIZATION_LEASE_TTL_MS
  const result = await database.queryWithValues<{ entity_id: string }>(
    SQL`UPDATE pending_deployments
        SET status = 'FINALIZING', finalizing_at = now()
        WHERE entity_id = ${entityId}
          AND (status = 'UPLOADING' OR (status = 'FINALIZING' AND finalizing_at < to_timestamp(${staleCutoff} / 1000.0)))
        RETURNING entity_id`,
    'pending_deployment_acquire_lease'
  )
  return result.rowCount > 0
}

async function releaseFinalizationLease(database: DatabaseClient, entityId: string): Promise<void> {
  // Return a still-present row to UPLOADING so a later request can finalize it (used when a finalize
  // attempt fails without deploying). A successful deploy deletes the row instead, so this no-ops there.
  await database.queryWithValues(
    SQL`UPDATE pending_deployments SET status = 'UPLOADING', finalizing_at = NULL WHERE entity_id = ${entityId}`,
    'pending_deployment_release_lease'
  )
}

async function getOverlappingPointers(
  database: DatabaseClient,
  pointers: string[],
  excludeEntityId: string
): Promise<OverlappingPendingDeployment[]> {
  if (pointers.length === 0) {
    return []
  }
  const result = await database.queryWithValues<{ entity_id: string; entity_timestamp: string }>(
    SQL`SELECT entity_id, entity_timestamp
        FROM pending_deployments
        WHERE pointers && ${pointers} AND entity_id <> ${excludeEntityId}`,
    'pending_deployment_get_overlapping'
  )
  return result.rows.map((r) => ({ entityId: r.entity_id, entityTimestamp: parseInt(r.entity_timestamp, 10) }))
}

async function deleteOverlappingPointers(
  database: DatabaseClient,
  pointers: string[],
  excludeEntityId: string
): Promise<string[]> {
  if (pointers.length === 0) {
    return []
  }
  const result = await database.queryWithValues<{ entity_id: string }>(
    SQL`DELETE FROM pending_deployments
        WHERE pointers && ${pointers} AND entity_id <> ${excludeEntityId}
        RETURNING entity_id`,
    'pending_deployment_delete_overlapping'
  )
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
    acquireFinalizationLease,
    releaseFinalizationLease,
    deleteExpired,
    streamAllNonExpiredHashes,
    acquireStagingLock
  }
}
