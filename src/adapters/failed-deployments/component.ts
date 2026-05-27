import SQL from 'sql-template-strings'
import { DatabaseClient } from '../database'
import { AppComponents } from '../../types'
import {
  FailedDeployment,
  IFailedDeploymentsComponent,
  isSnapshotFailedDeployment,
  SnapshotFailedDeployment
} from './types'

const FAILED_DEPLOYMENTS_METRIC = 'dcl_content_server_failed_deployments'

/**
 * Owns both the failed-deployments table (SQL) and an in-process mirror of it (Map).
 *
 * The SQL methods (`saveSnapshotFailedDeployment`, `deleteFailedDeployment`) are pure
 * persistence — they do NOT mutate the in-memory mirror. This avoids cache/DB drift
 * when callers compose them inside a transaction: if the first statement commits to
 * the cache but the second statement throws, the rollback would leave the cache out
 * of sync with the rolled-back DB.
 *
 * Callers are responsible for the matching cache update via `cacheFailedDeployment`
 * (upsert) once the transaction has been committed. The single-step convenience
 * `removeFailedDeployment` colocates the SQL+evict because it isn't composed with
 * any other transactional statement.
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

  async function deleteFromTable(db: DatabaseClient, entityId: string): Promise<void> {
    await db.queryWithValues(
      SQL`DELETE FROM failed_deployments WHERE entity_id = ${entityId}`,
      'delete_failed_deployment'
    )
  }

  async function saveSnapshotFailedDeployment(db: DatabaseClient, deployment: SnapshotFailedDeployment) {
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
  }

  async function cacheFailedDeployment(deployment: FailedDeployment) {
    failedDeploymentsByEntityId.set(deployment.entityId, deployment)
    observeSize()
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

    saveSnapshotFailedDeployment,

    deleteFailedDeployment: deleteFromTable,

    cacheFailedDeployment,

    async removeFailedDeployment(entityId: string) {
      // Hot path called after every successful deployment; bail before touching the DB
      // if the entity was never marked as failed. Single statement — no transaction
      // composition risk, so the cache evict can safely follow the SQL.
      if (!failedDeploymentsByEntityId.has(entityId)) return
      await deleteFromTable(database, entityId)
      if (failedDeploymentsByEntityId.delete(entityId)) {
        observeSize()
      }
    },

    async reportFailure(deployment: FailedDeployment) {
      if (isSnapshotFailedDeployment(deployment)) {
        // Snapshot deployments are persisted. If the entity is already cached we re-report it
        // by deleting and re-inserting inside a single transaction; otherwise a plain insert suffices.
        const reported = failedDeploymentsByEntityId.get(deployment.entityId)
        if (reported) {
          await database.transaction(async (txDatabase) => {
            await deleteFromTable(txDatabase, deployment.entityId)
            await saveSnapshotFailedDeployment(txDatabase, deployment)
          }, 'tx_failed_deployments')
        } else {
          await saveSnapshotFailedDeployment(database, deployment)
        }
      }
      // Apply the cache update only after the SQL has fully committed. If we updated the
      // cache inside the SQL methods, a multi-step transaction whose second statement
      // throws would leave the cache out of sync with the rolled-back DB.
      await cacheFailedDeployment(deployment)
    }
  }
}
