import { DeploymentWithAuthChain } from '@dcl/schemas'
import SQL from 'sql-template-strings'
import { NewSnapshotMetadata } from '../../ports/snapshotGenerator'
import { AppComponents } from '../../types'
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
        entity_id,
        entity_type,
        entity_pointers,
        auth_chain,
        date_part('epoch', local_timestamp) * 1000 AS local_timestamp
      FROM deployments d
      WHERE d.deleter_deployment IS NULL
    `,
    options,
    'stream_active_deployments'
  )) {
    yield {
      entityId: row.entity_id,
      entityType: row.entity_type,
      pointers: row.entity_pointers,
      localTimestamp: row.local_timestamp,
      authChain: row.auth_chain
    }
  }
}

export async function* streamActiveDeploymentsInTimeRange(
  components: Pick<AppComponents, 'database'>,
  timeRange: TimeRange
): AsyncIterable<DeploymentWithAuthChain> {
  // IT IS IMPORTANT THAT THIS QUERY NEVER CHANGES. ORDER IS NOT GUARANTEED  `
  for await (const row of components.database.streamQuery(
    SQL`
    SELECT
      entity_id,
      entity_type,
      entity_pointers,
      auth_chain,
      date_part('epoch', local_timestamp) * 1000 AS local_timestamp
    FROM deployments d
    WHERE d.deleter_deployment IS NULL
    AND to_timestamp(${timeRange.initTimestampSecs}) <= local_timestamp
    AND local_timestamp <= to_timestamp(${timeRange.endTimestampSecs})
    `,
    { batchSize: 1000 },
    'stream_active_deployments_in_timerange'
  )) {
    yield {
      entityId: row.entity_id,
      entityType: row.entity_type,
      pointers: row.entity_pointers,
      localTimestamp: row.local_timestamp,
      authChain: row.auth_chain
    }
  }
}

export async function findSnapshotsStrictlyContainedInTimeRange(
  components: Pick<AppComponents, 'database'>,
  timerange: TimeRange
): Promise<NewSnapshotMetadata[]> {
  const query = SQL`
  SELECT
    hash,
    date_part('epoch', init_timestamp)  AS "initTimestampSecs",
    date_part('epoch', end_timestamp)  AS "endTimestampSecs",
    replaced_hashes as replacedSnapshotHashes,
    number_of_entities as numberOfEntities
  FROM snapshots
  WHERE to_timestamp(${timerange.initTimestampSecs}) <= init_timestamp
  AND end_timestamp <= to_timestamp(${timerange.endTimestampSecs})
  `
  return (
    await components.database.queryWithValues<{
      hash: string
      initTimestampSecs: number
      endTimestampSecs: number
      replacedSnapshotHashes: string[]
      numberOfEntities: number
    }>(query, 'find_snapshots_in_timerange')
  ).rows.map(({ hash, initTimestampSecs, endTimestampSecs, replacedSnapshotHashes, numberOfEntities }) => {
    return {
      hash,
      timeRange: {
        initTimestampSecs,
        endTimestampSecs
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
    to_timestamp(${snapshotMetadata.timeRange.initTimestampSecs}),
    to_timestamp(${snapshotMetadata.timeRange.endTimestampSecs}),
    ${snapshotMetadata.replacedSnapshotHashes ?? []},
    ${snapshotMetadata.numberOfEntities},
    to_timestamp(${generationTimestampSecs})
  )
  RETURNING hash
  `
  await database.queryWithValues(query, 'save_snapshot')
}

export async function deleteSnapshots(
  database: AppComponents['database'],
  snapshotHashesToDelete: string[]
): Promise<void> {
  const query = SQL`DELETE FROM snapshots WHERE hash IN (`
  const hashes = snapshotHashesToDelete.map((h, i) => (i < snapshotHashesToDelete.length - 1 ? SQL`${h},` : SQL`${h}`))
  hashes.forEach((hash) => query.append(hash))
  query.append(`);`)
  await database.queryWithValues(query, 'save_snapshot')
}
