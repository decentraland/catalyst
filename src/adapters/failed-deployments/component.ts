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

// Entity ids per batched DELETE. `ANY($1)` binds the whole chunk as one parameter, so this is not
// about the bind-parameter ceiling — it bounds each statement's payload, lock footprint and duration.
const DELETE_BATCH_SIZE = 1000

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
 * (upsert) once the transaction has been committed. The conveniences `removeFailedDeployment`
 * and `removeExhaustedFailedDeployments` colocate the SQL+evict because they aren't composed with
 * any other transactional statement; the batched form evicts per chunk, after that chunk's DELETE.
 */
export async function createFailedDeployments(
  components: Pick<AppComponents, 'metrics' | 'database'>
): Promise<IFailedDeploymentsComponent> {
  const { metrics, database } = components

  const failedDeploymentsByEntityId: Map<string, FailedDeployment> = new Map()

  function observeSize(): void {
    metrics.observe(FAILED_DEPLOYMENTS_METRIC, {}, failedDeploymentsByEntityId.size)
  }

  // Every write here is read-mirror → await SQL → write-mirror, and two of them for the same entity
  // can interleave across that await: the retry worker and the sync path both report, and the batched
  // give-up deletes alongside. Chaining them per entity makes each transition observe the previous
  // one's final state in both the table and the mirror, which no after-the-fact clamp can guarantee.
  const transitionsByEntityId = new Map<string, Promise<unknown>>()

  function serialized<T>(entityId: string, transition: () => Promise<T>): Promise<T> {
    const previous = transitionsByEntityId.get(entityId) ?? Promise.resolve()
    const current = previous.then(transition, transition)
    transitionsByEntityId.set(entityId, current)
    const release = () => {
      if (transitionsByEntityId.get(entityId) === current) {
        transitionsByEntityId.delete(entityId)
      }
    }
    current.then(release, release)
    return current
  }

  /**
   * Parks the transition chain of every listed entity until the returned function is called. Resolves
   * once all of them are parked, i.e. once whatever was already in flight for them has finished.
   */
  async function holdEntities(entityIds: string[]): Promise<() => void> {
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await Promise.all(
      entityIds.map(
        (entityId) =>
          new Promise<void>((parked) => {
            void serialized(entityId, () => {
              parked()
              return held
            })
          })
      )
    )
    return release
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

  /** Deletes the rows still at or above `minRetryCount` and reports which ones actually went. */
  async function deleteExhaustedFromTable(
    db: DatabaseClient,
    entityIds: string[],
    minRetryCount: number
  ): Promise<string[]> {
    const { rows } = await db.queryWithValues<{ entityId: string }>(
      SQL`DELETE FROM failed_deployments
          WHERE entity_id = ANY(${entityIds}) AND retry_count >= ${minRetryCount}
          RETURNING entity_id AS "entityId"`,
      'delete_failed_deployments'
    )
    return rows.map(({ entityId }) => entityId)
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
   * Upserts into the in-memory mirror, clamping the retry state so it can only move forward —
   * the same `GREATEST` rule the durable row applies. Per-entity serialization already keeps
   * reports from landing out of order; the clamp is the backstop for any write that bypasses it.
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

    removeFailedDeployment(entityId: string) {
      return serialized(entityId, async () => {
        // Hot path called after every successful deployment; bail before touching the DB
        // if the entity was never marked as failed. Single statement — no transaction
        // composition risk, so the cache evict can safely follow the SQL.
        if (!failedDeploymentsByEntityId.has(entityId)) return
        await deleteFromTable(database, entityId)
        if (failedDeploymentsByEntityId.delete(entityId)) {
          observeSize()
        }
      })
    },

    async removeExhaustedFailedDeployments(entityIds: string[], minRetryCount: number) {
      // De-duplicated so a repeated id can't inflate a chunk.
      const unique = Array.from(new Set(entityIds))

      // Chunked so no single statement grows unbounded on a large backlog. The chunks are not atomic
      // as a group, but each one evicts only after its own DELETE returned, so a rejected chunk
      // leaves its entries in both the table and the cache, to be removed next pass.
      for (let i = 0; i < unique.length; i += DELETE_BATCH_SIZE) {
        const chunk = unique.slice(i, i + DELETE_BATCH_SIZE)
        // Held for the whole DELETE → evict step, so a report for one of these entities that arrives
        // meanwhile runs after the eviction and starts from a clean slate instead of inheriting the
        // exhausted count or being evicted by a response that predates it.
        const release = await holdEntities(chunk)
        try {
          // Evicting exactly what the DELETE reports — rather than the whole chunk — is what keeps
          // the cache from diverging when the guard spares a row.
          const deleted = await deleteExhaustedFromTable(database, chunk, minRetryCount)
          for (const entityId of deleted) {
            failedDeploymentsByEntityId.delete(entityId)
          }
          if (deleted.length > 0) {
            observeSize()
          }
        } finally {
          release()
        }
      }
    },

    reportFailure(deployment: FailedDeployment) {
      return serialized(deployment.entityId, async () => {
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
      })
    }
  }
}
