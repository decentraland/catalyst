import SQL from 'sql-template-strings'
import { FailedDeployment } from '../../ports/failedDeployments'
import { AppComponents } from '../../types'

export async function saveFailedDeployment(
  components: Pick<AppComponents, 'database'>,
  failedDeployment: FailedDeployment
): Promise<void> {
  const { entityId, entityType, failureTimestamp, reason, authChain, errorDescription } = failedDeployment
  const query = SQL`
  INSERT INTO failed_deployments
  (entity_id, entity_type, failure_time, reason, auth_chain, error_description)
  VALUES
  (${entityId}, ${entityType}, to_timestamp(${failureTimestamp} / 1000.0), ${reason}, ${JSON.stringify(
    authChain
  )}, ${errorDescription})
  RETURNING entity_id
  `
  await components.database.queryWithValues(query, 'save_failed_deployment')
}

export async function deleteFailedDeployment(
  components: Pick<AppComponents, 'database'>,
  entityId: string
): Promise<void> {
  await components.database.queryWithValues<{ count: string }>(
    SQL`DELETE FROM failed_deployments WHERE entity_id = ${entityId}`,
    'delete_failed_deployment'
  )
}

export async function getFailedDeployments(components: Pick<AppComponents, 'database'>): Promise<FailedDeployment[]> {
  const query = SQL`
  SELECT
      entity_id AS "entityId",
      entity_type AS "entityType",
      date_part('epoch', failure_time) * 1000 AS "failureTimestamp",
      reason,
      auth_chain AS "authChain",
      error_description AS "errorDescription"
  FROM failed_deployments`
  const queryResult = await components.database.queryWithValues<FailedDeployment>(query, 'get_failed_deployments')
  return queryResult.rows
}
