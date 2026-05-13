import SQL from 'sql-template-strings'
import { DatabaseClient } from '../database'
import { AppComponents } from '../../types'
import { FailedDeployment, IFailedDeploymentsComponent, SnapshotFailedDeployment } from './types'

const FAILED_DEPLOYMENTS_METRIC = 'dcl_content_server_failed_deployments'

/**
 * Owns both the failed-deployments table (SQL) and an in-process mirror of it (Map).
 *
 * Writes that need transactional control take a `DatabaseClient` so the calling logic
 * component can pass a transaction client; the in-memory mirror is updated synchronously
 * after the SQL await succeeds. Pure read methods serve from the cache without touching
 * the database. A `cacheFailedDeployment` escape hatch exists for non-snapshot failures
 * that are intentionally not persisted.
 */
export async function createFailedDeployments(
  components: Pick<AppComponents, 'metrics' | 'database'>
): Promise<IFailedDeploymentsComponent> {
  const { metrics, database } = components

  const failedDeploymentsByEntityId: Map<string, FailedDeployment> = new Map()

  function observeSize(): void {
    metrics.observe(FAILED_DEPLOYMENTS_METRIC, {}, failedDeploymentsByEntityId.size)
  }

  async function getAllSnapshotFailedDeployments(db: DatabaseClient): Promise<SnapshotFailedDeployment[]> {
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
    const { rows } = await db.queryWithValues<SnapshotFailedDeployment>(query, 'get_failed_deployments')
    return rows
  }

  async function deleteFailedDeployment(db: DatabaseClient, entityId: string): Promise<void> {
    await db.queryWithValues(
      SQL`DELETE FROM failed_deployments WHERE entity_id = ${entityId}`,
      'delete_failed_deployment'
    )
    if (failedDeploymentsByEntityId.delete(entityId)) {
      observeSize()
    }
  }

  return {
    async start() {
      const persisted = await getAllSnapshotFailedDeployments(database)
      for (const deployment of persisted) {
        failedDeploymentsByEntityId.set(deployment.entityId, deployment)
      }
      observeSize()
    },

    async getAllFailedDeployments() {
      return Array.from(failedDeploymentsByEntityId.values())
    },

    async findFailedDeployment(entityId: string) {
      return failedDeploymentsByEntityId.get(entityId)
    },

    async saveSnapshotFailedDeployment(db: DatabaseClient, deployment: SnapshotFailedDeployment) {
      const { entityId, entityType, failureTimestamp, reason, authChain, errorDescription, snapshotHash } = deployment
      await db.queryWithValues(
        SQL`
          INSERT INTO failed_deployments
          (entity_id, entity_type, failure_time, reason, auth_chain, error_description, snapshot_hash)
          VALUES
          (${entityId}, ${entityType}, to_timestamp(${failureTimestamp} / 1000.0), ${reason},
           ${JSON.stringify(authChain)}, ${errorDescription}, ${snapshotHash})
          RETURNING entity_id`,
        'save_failed_deployment'
      )
      failedDeploymentsByEntityId.set(entityId, deployment)
      observeSize()
    },

    deleteFailedDeployment,

    async cacheFailedDeployment(deployment: FailedDeployment) {
      failedDeploymentsByEntityId.set(deployment.entityId, deployment)
      observeSize()
    },

    async removeFailedDeployment(entityId: string) {
      // Hot path called after every successful deployment; bail before touching the DB
      // if the entity was never marked as failed.
      if (!failedDeploymentsByEntityId.has(entityId)) return
      await deleteFailedDeployment(database, entityId)
    }
  }
}
