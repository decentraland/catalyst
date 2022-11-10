import { DeploymentWithAuthChain } from '@dcl/schemas'
import SQL from 'sql-template-strings'
import { AppComponents } from '../../types'
import { NewSnapshotMetadata } from '../snapshots'
import { TimeRange } from '../time-range'

export async function* streamActiveDeployments(
  components: Pick<AppComponents, 'database'>
): AsyncIterable<DeploymentWithAuthChain> {
  const { database } = components

  const options = { batchSize: 1000 }

  for await (const row of database.streamQuery(
    // IT IS IMPORTANT THAT THIS QUERY NEVER CHANGES. ORDER IS NOT GUARANTEED
    SQL`
      SELECT
        entity_id AS "entityId",
        entity_type AS "entityType",
        entity_pointers AS "pointers",
        auth_chain AS "authChain",
        date_part('epoch', entity_timestamp) * 1000 AS "entityTimestamp"
      FROM deployments d
      WHERE d.deleter_deployment IS NULL
    `,
    options,
    'stream_active_deployments'
  )) {
    yield row
  }
}

export async function* streamActiveDeploymentsInTimeRange(
  components: Pick<AppComponents, 'database'>,
  timeRange: TimeRange
): AsyncIterable<DeploymentWithAuthChain> {
  // IT IS IMPORTANT THAT THIS QUERY NEVER CHANGES
  for await (const row of components.database.streamQuery<DeploymentWithAuthChain>(
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
  components: Pick<AppComponents, 'database'>,
  timerange: TimeRange
): Promise<NewSnapshotMetadata[]> {
  const query = SQL`
  SELECT
    hash,
    date_part('epoch', init_timestamp) * 1000  AS "initTimestamp",
    date_part('epoch', end_timestamp) * 1000  AS "endTimestamp",
    replaced_hashes AS "replacedSnapshotHashes",
    number_of_entities AS "numberOfEntities"
  FROM snapshots s
  WHERE init_timestamp >= to_timestamp(${timerange.initTimestamp} / 1000.0)
  AND end_timestamp <= to_timestamp(${timerange.endTimestamp} / 1000.0)
  AND NOT EXISTS (
    SELECT id FROM deployments
      WHERE deleter_deployment IS null
      AND entity_timestamp BETWEEN s.init_timestamp AND s.end_timestamp
      AND local_timestamp > generation_time
    );
  `
  return (
    await components.database.queryWithValues<{
      hash: string
      initTimestamp: number
      endTimestamp: number
      replacedSnapshotHashes: string[]
      numberOfEntities: number
    }>(query, 'find_snapshots_in_timerange')
  ).rows.map(({ hash, initTimestamp, endTimestamp, replacedSnapshotHashes, numberOfEntities }) => {
    return {
      hash,
      timeRange: {
        initTimestamp,
        endTimestamp
      },
      replacedSnapshotHashes,
      numberOfEntities
    }
  })
}

export async function saveSnapshot(
  database: AppComponents['database'],
  snapshotMetadata: NewSnapshotMetadata,
  generationTimestampSecs: number
): Promise<void> {
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
    to_timestamp(${generationTimestampSecs} / 1000.0)
  )
  RETURNING hash
  `
  await database.queryWithValues(query, 'save_snapshot')
}

export async function getSnapshotHashesNotInTimeRange(
  database: AppComponents['database'],
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
  database: AppComponents['database'],
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

export async function saveProcessedSnapshot(
  database: AppComponents['database'],
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
  components: Pick<AppComponents, 'database'>,
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

  const result = await components.database.queryWithValues<{ hash: string }>(query, 'get_processed_snapshots')
  return new Set(result.rows.map((row) => row.hash))
}
