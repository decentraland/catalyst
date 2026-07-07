import SQL from 'sql-template-strings'
import { DatabaseClient } from '../../adapters/database'
import { IPendingDeploymentsRepository, PendingDeploymentRow, UpsertPendingDeployment } from './types'

// Fixed key for the transaction-scoped advisory lock that serializes the "replace overlapping + upsert"
// critical section across staging requests (and processes). An arbitrary distinctive constant chosen
// not to collide with node-pg-migrate's migration lock.
const PENDING_DEPLOYMENTS_ADVISORY_LOCK = 916352745601

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
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

async function getByEntityId(database: DatabaseClient, entityId: string): Promise<PendingDeploymentRow | undefined> {
  const result = await database.queryWithValues<PendingDeploymentDbRow>(
    SQL`SELECT entity_id, entity_type, pointers, content_hashes, deployer_address, created_at, updated_at
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

async function upsert(database: DatabaseClient, row: UpsertPendingDeployment): Promise<void> {
  // ON CONFLICT bumps only `updated_at`: `created_at` is the deployment-TTL anchor and must stay
  // stable so resuming an upload never extends the window. entity_id is content-addressed, so the
  // other columns are immutable for a given id anyway.
  await database.queryWithValues(
    SQL`INSERT INTO pending_deployments
          (entity_id, entity_type, pointers, content_hashes, deployer_address, created_at, updated_at)
        VALUES
          (${row.entityId}, ${row.entityType}, ${row.pointers}, ${row.contentHashes}, ${row.deployerAddress}, now(), now())
        ON CONFLICT (entity_id) DO UPDATE SET updated_at = now()`,
    'pending_deployment_upsert'
  )
}

async function deleteByEntityId(database: DatabaseClient, entityId: string): Promise<void> {
  await database.queryWithValues(
    SQL`DELETE FROM pending_deployments WHERE entity_id = ${entityId}`,
    'pending_deployment_delete'
  )
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
    deleteOverlappingPointers,
    deleteExpired,
    streamAllNonExpiredHashes,
    acquireStagingLock
  }
}
