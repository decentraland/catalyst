import { SnapshotSyncDeployment } from '@dcl/schemas'
import { SnapshotMetadata, TimeRange } from '@dcl/snapshots-fetcher/dist/types'
import { SQL } from 'sql-template-strings'
import { DatabaseClient } from '../../ports/postgres.js'

export async function* streamActiveDeploymentsInTimeRange(
  database: DatabaseClient,
  timeRange: TimeRange
): AsyncIterable<SnapshotSyncDeployment> {
  // IT IS IMPORTANT THAT THIS QUERY NEVER CHANGES
  // It ensures the snapshots immutability and convergency (the order and the select of static fields)
  for await (const row of database.streamQuery<SnapshotSyncDeployment>(
    SQL`
    SELECT
      entity_id AS "entityId",
      entity_type AS "entityType",
      entity_pointers AS "pointers",
      auth_chain AS "authChain",
      date_part('epoch', entity_timestamp) * 1000 AS "entityTimestamp"
    FROM deployments
    WHERE deleter_deployment IS NULL
    AND entity_timestamp BETWEEN to_timestamp(${timeRange.initTimestamp} / 1000.0) AND to_timestamp(${timeRange.endTimestamp} / 1000.0)
    ORDER BY entity_timestamp
    `,
    { batchSize: 1000 },
    'stream_active_deployments_in_timerange'
  )) {
    yield row
  }
}

export async function findSnapshotsStrictlyContainedInTimeRange(
  database: DatabaseClient,
  timerange: TimeRange
): Promise<SnapshotMetadata[]> {
  const query = SQL`
  SELECT
    hash,
    date_part('epoch', init_timestamp) * 1000  AS "initTimestamp",
    date_part('epoch', end_timestamp) * 1000  AS "endTimestamp",
    replaced_hashes AS "replacedSnapshotHashes",
    number_of_entities AS "numberOfEntities",
    date_part('epoch', generation_time) * 1000  AS "generationTimestamp"
  FROM snapshots s
  WHERE init_timestamp >= to_timestamp(${timerange.initTimestamp} / 1000.0)
  AND end_timestamp <= to_timestamp(${timerange.endTimestamp} / 1000.0)
  `
  return (
    await database.queryWithValues<{
      hash: string
      initTimestamp: number
      endTimestamp: number
      replacedSnapshotHashes: string[]
      numberOfEntities: number
      generationTimestamp: number
    }>(query, 'find_snapshots_in_timerange')
  ).rows.map(({ hash, initTimestamp, endTimestamp, replacedSnapshotHashes, numberOfEntities, generationTimestamp }) => {
    return {
      hash,
      timeRange: {
        initTimestamp,
        endTimestamp
      },
      replacedSnapshotHashes,
      numberOfEntities,
      generationTimestamp
    }
  })
}

export async function saveSnapshot(database: DatabaseClient, snapshotMetadata: SnapshotMetadata): Promise<void> {
  const query = SQL`
  INSERT INTO snapshots
  (hash, init_timestamp, end_timestamp, replaced_hashes, number_of_entities, generation_time)
  VALUES
  (
    ${snapshotMetadata.hash},
    to_timestamp(${snapshotMetadata.timeRange.initTimestamp} / 1000.0),
    to_timestamp(${snapshotMetadata.timeRange.endTimestamp} / 1000.0),
    ${snapshotMetadata.replacedSnapshotHashes ?? []},
    ${snapshotMetadata.numberOfEntities},
    to_timestamp(${snapshotMetadata.generationTimestamp} / 1000.0)
  )
  RETURNING hash
  `
  await database.queryWithValues(query, 'save_snapshot')
}

export async function isOwnSnapshot(database: DatabaseClient, snapshotHash: string): Promise<boolean> {
  const queryResult = await database.queryWithValues<{ hash: string }>(
    SQL`SELECT hash from snapshots WHERE hash = ${snapshotHash}`,
    'has_snapshot'
  )
  return queryResult.rowCount > 0
}

export async function getSnapshotHashesNotInTimeRange(
  database: DatabaseClient,
  snapshotHashes: string[],
  timeRange: TimeRange
): Promise<Set<string>> {
  if (snapshotHashes.length == 0) {
    return new Set()
  }
  const query = SQL`
  SELECT hash
  FROM snapshots
  WHERE init_timestamp <= end_timestamp
  AND (init_timestamp >= to_timestamp(${timeRange.endTimestamp} / 1000.0)
  OR end_timestamp <= to_timestamp(${timeRange.initTimestamp} / 1000.0))
  AND hash IN (`
  const hashes = snapshotHashes.map((h, i) => (i < snapshotHashes.length - 1 ? SQL`${h},` : SQL`${h}`))
  hashes.forEach((hash) => query.append(hash))
  query.append(`);`)

  const result = await database.queryWithValues<{ hash: string }>(query, 'get_snapshots')
  return new Set(result.rows.map((row) => row.hash))
}

export async function deleteSnapshotsInTimeRange(
  database: DatabaseClient,
  snapshotHashesToDelete: string[],
  timeRange: TimeRange
): Promise<void> {
  if (snapshotHashesToDelete.length == 0) {
    return
  }
  const query = SQL`
    DELETE FROM snapshots
    WHERE init_timestamp >= to_timestamp(${timeRange.initTimestamp} / 1000.0)
    AND end_timestamp <= to_timestamp(${timeRange.endTimestamp} / 1000.0)
    AND hash IN (`
  const hashes = snapshotHashesToDelete.map((h, i) => (i < snapshotHashesToDelete.length - 1 ? SQL`${h},` : SQL`${h}`))
  hashes.forEach((hash) => query.append(hash))
  query.append(`);`)
  await database.queryWithValues(query, 'save_snapshot')
}

/**
 * A snapshot is outdated if there are entities with entity timestamp within the time range of the snapshot, but
 * they were not included because they were deployed after the generation timestamp of the snapshot.
 * In this case, the snapshot should be recreated in order to include these entities.
 */
export async function snapshotIsOutdated(database: DatabaseClient, snapshot: SnapshotMetadata): Promise<boolean> {
  const result = await database.queryWithValues<{ numberOfEntities: number }>(
    SQL`
  SELECT 1 FROM deployments
  WHERE deleter_deployment IS null
  AND entity_timestamp BETWEEN to_timestamp(${snapshot.timeRange.initTimestamp} / 1000.0) AND to_timestamp(${snapshot.timeRange.endTimestamp} / 1000.0)
  AND local_timestamp > to_timestamp(${snapshot.generationTimestamp} / 1000.0);

  `,
    'snapshot_is_outdated'
  )
  return result.rowCount > 0
}

export async function getNumberOfActiveEntitiesInTimeRange(
  database: DatabaseClient,
  timeRange: TimeRange
): Promise<number> {
  const result = await database.queryWithValues<{ numberOfEntities: number }>(
    SQL`
  SELECT
    COUNT(*) AS "numberOfEntities"
  FROM deployments
  WHERE deleter_deployment IS NULL
  AND entity_timestamp BETWEEN to_timestamp(${timeRange.initTimestamp} / 1000.0) AND to_timestamp(${timeRange.endTimestamp} / 1000.0)
  `,
    'number_of_active_entities'
  )
  return result.rows[0].numberOfEntities
}

export async function saveProcessedSnapshot(
  database: DatabaseClient,
  processedSnapshotHash: string,
  processTimestampSecs: number
): Promise<void> {
  const query = SQL`
  INSERT INTO processed_snapshots
  (hash, process_time)
  VALUES
  (${processedSnapshotHash}, to_timestamp(${processTimestampSecs} / 1000.0))
  RETURNING hash
  `
  await database.queryWithValues(query, 'save_processed_snapshot')
}

export async function getProcessedSnapshots(
  database: DatabaseClient,
  processedSnapshotHashes: string[]
): Promise<Set<string>> {
  const query = SQL`
  SELECT hash
  FROM processed_snapshots
  WHERE hash IN (`
  const hashes = processedSnapshotHashes.map((h, i) =>
    i < processedSnapshotHashes.length - 1 ? SQL`${h},` : SQL`${h}`
  )
  hashes.forEach((hash) => query.append(hash))
  query.append(`);`)

  const result = await database.queryWithValues<{ hash: string }>(query, 'get_processed_snapshots')
  return new Set(result.rows.map((row) => row.hash))
}
