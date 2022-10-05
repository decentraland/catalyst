import SQL from 'sql-template-strings'
import { FailedDeployment } from '../../ports/failedDeployments'
import { AppComponents } from '../../types'

export async function saveFailedDeployment(
  components: Pick<AppComponents, 'database'>,
  failedDeployment: FailedDeployment
): Promise<void> {
  const { entityId, entityType, failureTimestamp, reason, authChain, errorDescription, snapshotHash } = failedDeployment
  const query = SQL`
  INSERT INTO failed_deployments
  (entity_id, entity_type, failure_time, reason, auth_chain, error_description, snapshot_hash)
  VALUES
  (${entityId}, ${entityType}, to_timestamp(${failureTimestamp} / 1000.0), ${reason}, ${JSON.stringify(
    authChain
  )}, ${errorDescription}, ${snapshotHash})
  RETURNING entity_id
  `
  await components.database.queryWithValues(query, 'save_failed_deployment')
}

export async function deleteFailedDeployment(
  components: Pick<AppComponents, 'database'>,
  entityId: string
): Promise<boolean> {
  const queryResult = await components.database.queryWithValues<{ count: number }>(
    SQL`
  WITH deleted AS (
    DELETE FROM failed_deployments WHERE entity_id = ${entityId} RETURNING *
  ) SELECT count(*) FROM deleted;`,
    'delete_failed_deployment'
  )
  return queryResult.rows[0].count > 0
}

export async function getFailedDeployments(components: Pick<AppComponents, 'database'>): Promise<FailedDeployment[]> {
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
  const queryResult = await components.database.queryWithValues<FailedDeployment>(query, 'save_failed_deployment')
  return queryResult.rows
}

export async function getFailedDeploymentByEntityId(
  components: Pick<AppComponents, 'database'>,
  entityId: string
): Promise<FailedDeployment | undefined> {
  const query = SQL`
  SELECT
      entity_id AS "entityId",
      entity_type AS "entityType",
      date_part('epoch', failure_time) * 1000 AS "failureTimestamp",
      reason,
      auth_chain AS "authChain",
      error_description AS "errorDescription",
      snapshot_hash AS "snapshotHash"
  FROM failed_deployments WHERE entity_id = ${entityId}`
  const queryResult = await components.database.queryWithValues<FailedDeployment>(query, 'save_failed_deployment')
  return queryResult.rowCount > 0 ? queryResult.rows[0] : undefined
}

export async function numberOfFailedDeployments(components: Pick<AppComponents, 'database'>): Promise<number> {
  const query = SQL`
  SELECT COUNT(*) FROM failed_deployments`
  const queryResult = await components.database.queryWithValues<{ count: number }>(query, 'save_failed_deployment')
  return queryResult.rows[0].count
}
