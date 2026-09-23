import SQL from 'sql-template-strings'
import { DatabaseClient } from '../../adapters/database'
import {
  FileReceipt,
  InsertPendingDeployment,
  IPendingDeploymentsRepository,
  PendingDeploymentRow,
  ReservationTotals
} from './types'

interface PendingDeploymentDbRow {
  entity_id: string
  entity_type: string
  pointers: string[]
  content_hashes: string[]
  deployer_address: string
  created_at: Date
  updated_at: Date
  initialized: boolean
}

const ROW_COLUMNS = SQL`entity_id, entity_type, pointers, content_hashes, deployer_address, created_at, updated_at, initialized`

function toRow(row: PendingDeploymentDbRow): PendingDeploymentRow {
  return {
    entityId: row.entity_id,
    entityType: row.entity_type as PendingDeploymentRow['entityType'],
    pointers: row.pointers,
    contentHashes: row.content_hashes,
    deployerAddress: row.deployer_address,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    initialized: row.initialized
  }
}

function cutoff(ttlMs: number) {
  return SQL`to_timestamp(${Date.now() - ttlMs} / 1000.0)`
}

async function getByEntityId(database: DatabaseClient, entityId: string): Promise<PendingDeploymentRow | undefined> {
  const result = await database.queryWithValues<PendingDeploymentDbRow>(
    SQL`SELECT `.append(ROW_COLUMNS).append(SQL` FROM pending_deployments WHERE entity_id = ${entityId}`),
    'pending_deployment_by_id'
  )
  return result.rowCount > 0 ? toRow(result.rows[0]) : undefined
}

async function insert(database: DatabaseClient, row: InsertPendingDeployment): Promise<PendingDeploymentRow> {
  const result = await database.queryWithValues<PendingDeploymentDbRow>(
    SQL`INSERT INTO pending_deployments (entity_id, entity_type, pointers, content_hashes, deployer_address)
        VALUES (${row.entityId}, ${row.entityType}, ${row.pointers}, ${
      row.contentHashes
    }, ${row.deployerAddress.toLowerCase()})
        RETURNING `.append(ROW_COLUMNS),
    'pending_deployment_insert'
  )
  return toRow(result.rows[0])
}

async function countByDeployer(database: DatabaseClient, deployerAddress: string): Promise<number> {
  const result = await database.queryWithValues<{ count: string }>(
    SQL`SELECT COUNT(*) AS count FROM pending_deployments WHERE deployer_address = ${deployerAddress.toLowerCase()}`,
    'pending_deployment_count_by_deployer'
  )
  return parseInt(result.rows[0].count, 10)
}

async function acquireDeployerLock(database: DatabaseClient, deployerAddress: string): Promise<void> {
  await database.queryWithValues(
    SQL`SELECT pg_advisory_xact_lock(hashtextextended(${'pending_deployer:' + deployerAddress.toLowerCase()}, 0))`,
    'pending_deployment_deployer_lock'
  )
}

async function acquireBudgetLock(database: DatabaseClient): Promise<void> {
  await database.queryWithValues(
    SQL`SELECT pg_advisory_xact_lock(hashtextextended('partial-upload-budget', 0))`,
    'pending_deployment_budget_lock'
  )
}

async function upsertFileReceipts(database: DatabaseClient, entityId: string, receipts: FileReceipt[]): Promise<void> {
  if (receipts.length === 0) {
    return
  }
  await database.queryWithValues(
    SQL`INSERT INTO pending_deployment_files (entity_id, hash, size, stored)
        SELECT ${entityId}, r.hash, r.size, r.stored
        FROM jsonb_to_recordset(${JSON.stringify(receipts)}::jsonb) AS r(hash text, size bigint, stored boolean)
        ON CONFLICT (entity_id, hash) DO UPDATE SET
          size = GREATEST(pending_deployment_files.size, EXCLUDED.size),
          stored = pending_deployment_files.stored OR EXCLUDED.stored`,
    'pending_deployment_upsert_receipts'
  )
}

async function refreshReservedBytes(database: DatabaseClient, entityId: string): Promise<void> {
  await database.queryWithValues(
    SQL`UPDATE pending_deployments SET updated_at = now(), reserved_bytes = (
          SELECT COALESCE(SUM(size), 0) FROM pending_deployment_files WHERE entity_id = ${entityId}
        ) WHERE entity_id = ${entityId}`,
    'pending_deployment_refresh_reserved'
  )
}

async function getReservationTotals(
  database: DatabaseClient,
  entityId: string,
  deployerAddress: string
): Promise<ReservationTotals> {
  const result = await database.queryWithValues<{ account: string; total: string; scene: string }>(
    SQL`SELECT
          COALESCE(SUM(reserved_bytes) FILTER (WHERE deployer_address = ${deployerAddress.toLowerCase()}), 0)::text AS account,
          COALESCE(SUM(reserved_bytes), 0)::text AS total,
          (SELECT COALESCE(SUM(size), 0)::text FROM pending_deployment_files
            WHERE entity_id = ${entityId} AND hash <> ${entityId}) AS scene
        FROM pending_deployments`,
    'pending_deployment_reservation_totals'
  )
  const row = result.rows[0]
  return { account: BigInt(row.account), total: BigInt(row.total), scene: BigInt(row.scene) }
}

async function addIncomingBytes(database: DatabaseClient, deployerAddress: string, bytes: number): Promise<bigint> {
  const result = await database.queryWithValues<{ bytes: string }>(
    SQL`INSERT INTO partial_upload_rates (deployer_address, window_started, bytes)
        VALUES (${deployerAddress.toLowerCase()}, now(), ${bytes})
        ON CONFLICT (deployer_address) DO UPDATE SET
          bytes = CASE WHEN partial_upload_rates.window_started < now() - interval '1 minute'
            THEN EXCLUDED.bytes ELSE partial_upload_rates.bytes + EXCLUDED.bytes END,
          window_started = CASE WHEN partial_upload_rates.window_started < now() - interval '1 minute'
            THEN now() ELSE partial_upload_rates.window_started END
        RETURNING bytes::text AS bytes`,
    'pending_deployment_add_incoming_bytes'
  )
  return BigInt(result.rows[0].bytes)
}

async function markStored(database: DatabaseClient, entityId: string, hashes: string[]): Promise<void> {
  await database.queryWithValues(
    SQL`UPDATE pending_deployment_files SET stored = true WHERE entity_id = ${entityId} AND hash = ANY(${hashes}::text[])`,
    'pending_deployment_mark_stored'
  )
}

async function markInitialized(database: DatabaseClient, entityId: string): Promise<void> {
  await database.queryWithValues(
    SQL`UPDATE pending_deployments SET initialized = true WHERE entity_id = ${entityId}`,
    'pending_deployment_mark_initialized'
  )
}

async function markMissing(database: DatabaseClient, entityId: string, hashes: string[]): Promise<void> {
  await database.queryWithValues(
    SQL`UPDATE pending_deployment_files SET stored = false WHERE entity_id = ${entityId} AND hash = ANY(${hashes}::text[])`,
    'pending_deployment_mark_missing'
  )
}

async function getStoredFiles(database: DatabaseClient, entityId: string): Promise<Map<string, number>> {
  const result = await database.queryWithValues<{ hash: string; size: string }>(
    SQL`SELECT hash, size::text AS size FROM pending_deployment_files WHERE entity_id = ${entityId} AND stored`,
    'pending_deployment_stored_files'
  )
  return new Map(result.rows.map((row) => [row.hash, Number(row.size)]))
}

async function getStagedKeys(database: DatabaseClient, entityId: string): Promise<string[]> {
  const result = await database.queryWithValues<{ hash: string }>(
    SQL`SELECT hash FROM pending_deployment_files WHERE entity_id = ${entityId} UNION SELECT ${entityId}::text`,
    'pending_deployment_staged_keys'
  )
  return result.rows.map((row) => row.hash)
}

async function deleteByEntityId(database: DatabaseClient, entityId: string): Promise<void> {
  await database.queryWithValues(
    SQL`DELETE FROM pending_deployments WHERE entity_id = ${entityId}`,
    'pending_deployment_delete'
  )
}

async function listExpired(database: DatabaseClient, ttlMs: number, limit: number): Promise<string[]> {
  const result = await database.queryWithValues<{ entity_id: string }>(
    SQL`SELECT entity_id FROM pending_deployments WHERE created_at < `
      .append(cutoff(ttlMs))
      .append(SQL` ORDER BY created_at LIMIT ${limit}`),
    'pending_deployment_list_expired'
  )
  return result.rows.map((row) => row.entity_id)
}

async function deleteExpiredByEntityId(database: DatabaseClient, entityId: string, ttlMs: number): Promise<void> {
  await database.queryWithValues(
    SQL`DELETE FROM pending_deployments WHERE entity_id = ${entityId} AND created_at < `.append(cutoff(ttlMs)),
    'pending_deployment_delete_expired'
  )
}

async function deleteElapsedRateWindows(database: DatabaseClient): Promise<void> {
  await database.queryWithValues(
    SQL`DELETE FROM partial_upload_rates WHERE window_started < now() - interval '1 minute'`,
    'pending_deployment_delete_rate_windows'
  )
}

async function getReservedBytes(database: DatabaseClient, ttlMs: number): Promise<{ total: number; expired: number }> {
  const result = await database.queryWithValues<{ total: string; expired: string }>(
    SQL`SELECT COALESCE(SUM(reserved_bytes), 0)::text AS total,
          COALESCE(SUM(reserved_bytes) FILTER (WHERE created_at < `
      .append(cutoff(ttlMs))
      .append(SQL`), 0)::text AS expired FROM pending_deployments`),
    'pending_deployment_reserved_bytes'
  )
  return { total: Number(result.rows[0].total), expired: Number(result.rows[0].expired) }
}

async function* streamAllNonExpiredHashes(
  database: DatabaseClient,
  ttlMs: number,
  options?: { batchSize?: number }
): AsyncIterable<string> {
  const live = cutoff(ttlMs)
  const query = SQL`SELECT entity_id AS hash FROM pending_deployments WHERE created_at > `
    .append(live)
    .append(SQL` UNION SELECT unnest(content_hashes) AS hash FROM pending_deployments WHERE created_at > `)
    .append(live)
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
    insert,
    countByDeployer,
    acquireDeployerLock,
    acquireBudgetLock,
    upsertFileReceipts,
    refreshReservedBytes,
    getReservationTotals,
    addIncomingBytes,
    markStored,
    markInitialized,
    markMissing,
    getStoredFiles,
    getStagedKeys,
    deleteByEntityId,
    listExpired,
    deleteExpiredByEntityId,
    deleteElapsedRateWindows,
    getReservedBytes,
    streamAllNonExpiredHashes
  }
}
