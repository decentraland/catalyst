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
          snapshot_hash AS "snapshotHash",
          retry_count AS "retryCount",
          date_part('epoch', next_retry_at) * 1000 AS "nextRetryAt"
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

  async function saveSnapshotFailedDeployment(
    db: DatabaseClient,
    deployment: SnapshotFailedDeployment
  ): Promise<{ retryCount: number; nextRetryAt: number }> {
    const { entityId, entityType, failureTimestamp, reason, authChain, errorDescription, snapshotHash } = deployment
    const retryCount = deployment.retryCount ?? 0
    const nextRetryAt = deployment.nextRetryAt ?? 0
    const { rows } = await db.queryWithValues<{ retryCount: number; nextRetryAt: number }>(
      SQL`
        INSERT INTO failed_deployments
        (entity_id, entity_type, failure_time, reason, auth_chain, error_description, snapshot_hash, retry_count, next_retry_at)
        VALUES
        (${entityId}, ${entityType}, to_timestamp(${failureTimestamp} / 1000.0), ${reason},
         ${JSON.stringify(authChain)}, ${errorDescription}, ${snapshotHash}, ${retryCount},
         to_timestamp(${nextRetryAt} / 1000.0))
        ON CONFLICT (entity_id) DO UPDATE SET
          entity_type = EXCLUDED.entity_type,
          failure_time = EXCLUDED.failure_time,
          reason = EXCLUDED.reason,
          auth_chain = EXCLUDED.auth_chain,
          error_description = EXCLUDED.error_description,
          snapshot_hash = EXCLUDED.snapshot_hash,
          retry_count = GREATEST(failed_deployments.retry_count, EXCLUDED.retry_count),
          next_retry_at = GREATEST(failed_deployments.next_retry_at, EXCLUDED.next_retry_at)
        RETURNING
          retry_count AS "retryCount",
          date_part('epoch', next_retry_at) * 1000 AS "nextRetryAt"`,
      'save_failed_deployment'
    )
    return rows[0]
  }

  /**
   * Upserts into the in-memory mirror, clamping the retry state so it can only move forward.
   *
   * `reportFailure` reads the current retry state, awaits the SQL round-trip and only then
   * writes the cache, so two concurrent reports for the same entity (the retry worker runs
   * with `SYNC_DEPLOY_CONCURRENCY` parallelism alongside the sync path, and both call
   * `reportFailure`) can resolve out of order and let the older canonical snapshot land last.
   * The SQL upsert already clamps the durable row with `GREATEST`; mirroring that here keeps
   * the cache from regressing below it. That matters because the retry loop schedules off
   * this cache, so a regression would retry before the durable deadline and need extra
   * attempts to reach the max-retry cap.
   *
   * Entries that are legitimately reset go through `removeFailedDeployment`, which evicts the
   * key — so a genuinely fresh failure starts from its own values rather than an old ceiling.
   */
  async function cacheFailedDeployment(deployment: FailedDeployment) {
    const existing = failedDeploymentsByEntityId.get(deployment.entityId)
    const monotonic: FailedDeployment = existing
      ? {
          ...deployment,
          retryCount: Math.max(deployment.retryCount ?? 0, existing.retryCount ?? 0),
          nextRetryAt: Math.max(deployment.nextRetryAt ?? 0, existing.nextRetryAt ?? 0)
        }
      : deployment
    failedDeploymentsByEntityId.set(deployment.entityId, monotonic)
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
      const existing = failedDeploymentsByEntityId.get(deployment.entityId)
      const merged: FailedDeployment = {
        ...deployment,
        retryCount: deployment.retryCount ?? existing?.retryCount ?? 0,
        nextRetryAt: deployment.nextRetryAt ?? existing?.nextRetryAt ?? 0
      }
      if (isSnapshotFailedDeployment(merged)) {
        const canonical = await saveSnapshotFailedDeployment(database, merged)
        merged.retryCount = canonical.retryCount
        merged.nextRetryAt = canonical.nextRetryAt
      }
      await cacheFailedDeployment(merged)
    }
  }
}
