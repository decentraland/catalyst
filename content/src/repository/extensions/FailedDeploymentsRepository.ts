import { Database } from '@katalyst/content/repository/Database'
import { FailedDeployment, FailureReason } from '@katalyst/content/service/errors/FailedDeploymentsManager'
import { EntityId, EntityType, Timestamp } from 'dcl-catalyst-commons'

export class FailedDeploymentsRepository {
  constructor(private readonly db: Database) {}

  getAllFailedDeployments(): Promise<FailedDeployment[]> {
    return this.db.map(
      `
            SELECT
                entity_type,
                entity_id,
                date_part('epoch', failure_timestamp) * 1000 AS failure_timestamp,
                reason,
                error_description
            FROM failed_deployments
            ORDER BY failure_timestamp DESC`,
      [],
      (row) => ({
        entityType: row.entity_type,
        entityId: row.entity_id,
        failureTimestamp: row.failure_timestamp,
        reason: row.reason,
        errorDescription: row.error_description ?? undefined
      })
    )
  }

  findFailedDeployment(entityType: EntityType, entityId: EntityId): Promise<FailedDeployment | null> {
    return this.db.oneOrNone(
      `
            SELECT
                entity_type,
                entity_id,
                date_part('epoch', failure_timestamp) * 1000 AS failure_timestamp,
                reason,
                error_description
            FROM failed_deployments
            WHERE entity_type = $1 and entity_id = $2`,
      [entityType, entityId],
      (row) =>
        row && {
          entityType: row.entity_type,
          entityId: row.entity_id,
          failureTimestamp: row.failure_timestamp,
          reason: row.reason,
          errorDescription: row.error_description ?? undefined
        }
    )
  }

  reportSuccessfulDeployment(entityType: EntityType, entityId: EntityId): Promise<null> {
    return this.db.none('DELETE FROM failed_deployments WHERE entity_type = $1 AND entity_id = $2', [
      entityType,
      entityId
    ])
  }

  reportFailure(
    entityType: EntityType,
    entityId: EntityId,
    failureTimestamp: Timestamp,
    reason: FailureReason,
    errorDescription: string | undefined
  ): Promise<null> {
    return this.db.none(
      `INSERT INTO failed_deployments (
                    entity_type,
                    entity_id,
                    failure_timestamp,
                    reason,
                    error_description
                ) VALUES ($1, $2, to_timestamp($3 / 1000.0), $4, $5)
                ON CONFLICT ON CONSTRAINT failed_deployments_uniq_entity_id_entity_type
                DO UPDATE SET failure_timestamp = to_timestamp($3 / 1000.0), reason = $4, error_description = $5`,
      [entityType, entityId, failureTimestamp, reason, errorDescription]
    )
  }
}
