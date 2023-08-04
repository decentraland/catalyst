import SQL from 'sql-template-strings'
import { DatabaseClient } from 'src/ports/postgres'
import { SnapshotFailedDeployment } from '../../ports/failedDeployments.js'

export async function saveSnapshotFailedDeployment(
  database: DatabaseClient,
  failedDeployment: SnapshotFailedDeployment
): Promise<void> {
  const { entityId, entityType, failureTimestamp, reason, authChain, errorDescription } = failedDeployment
  const query = SQL`
  INSERT INTO failed_deployments
  (entity_id, entity_type, failure_time, reason, auth_chain, error_description, snapshot_hash)
  VALUES
  (${entityId}, ${entityType}, to_timestamp(${failureTimestamp} / 1000.0), ${reason}, ${JSON.stringify(
    authChain
  )}, ${errorDescription}, ${failedDeployment.snapshotHash})
  RETURNING entity_id
  `
  await database.queryWithValues(query, 'save_failed_deployment')
}

export async function deleteFailedDeployment(database: DatabaseClient, entityId: string): Promise<void> {
  await database.queryWithValues<{ count: string }>(
    SQL`DELETE FROM failed_deployments WHERE entity_id = ${entityId}`,
    'delete_failed_deployment'
  )
}

export async function getSnapshotFailedDeployments(database: DatabaseClient): Promise<SnapshotFailedDeployment[]> {
  const query = SQL`
  SELECT
      entity_id AS "entityId",
      entity_type AS "entityType",
      date_part('epoch', failure_time) * 1000 AS "failureTimestamp",
      reason,
      auth_chain AS "authChain",
      error_description AS "errorDescription",
      snapshot_hash AS "snapshotHash"
  FROM failed_deployments`
  const queryResult = await database.queryWithValues<SnapshotFailedDeployment>(query, 'get_failed_deployments')
  return queryResult.rows
}
