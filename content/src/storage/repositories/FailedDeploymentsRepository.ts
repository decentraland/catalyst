import { FailedDeployment, FailureReason } from '@katalyst/content/service/errors/FailedDeploymentsManager'
import { Repository } from '@katalyst/content/storage/Repository'
import { EntityId, EntityType, ServerAddress, Timestamp } from 'dcl-catalyst-commons'

export class FailedDeploymentsRepository {
  constructor(private readonly db: Repository) {}

  getAllFailedDeployments(): Promise<FailedDeployment[]> {
    return this.db.map(
      `
            SELECT
                entity_type,
                entity_id,
                date_part('epoch', origin_timestamp) * 1000 AS origin_timestamp,
                origin_server_url,
                date_part('epoch', failure_timestamp) * 1000 AS failure_timestamp,
                reason,
                error_description
            FROM failed_deployments
            ORDER BY failure_timestamp DESC`,
      [],
      (row) => ({
        entityType: row.entity_type,
        entityId: row.entity_id,
        originTimestamp: row.origin_timestamp,
        originServerUrl: row.origin_server_url,
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
                date_part('epoch', origin_timestamp) * 1000 AS origin_timestamp,
                origin_server_url,
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
          originTimestamp: row.origin_timestamp,
          originServerUrl: row.origin_server_url,
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
    originTimestamp: Timestamp,
    originServerUrl: ServerAddress,
    failureTimestamp: Timestamp,
    reason: FailureReason,
    errorDescription: string | undefined
  ): Promise<null> {
    return this.db.none(
      `INSERT INTO failed_deployments (
                    entity_type,
                    entity_id,
                    origin_timestamp,
                    origin_server_url,
                    failure_timestamp,
                    reason,
                    error_description
                ) VALUES ($1, $2, to_timestamp($3 / 1000.0), $4, to_timestamp($5 / 1000.0), $6, $7)
                ON CONFLICT ON CONSTRAINT failed_deployments_uniq_entity_id_entity_type
                DO UPDATE SET origin_timestamp = to_timestamp($3 / 1000.0), origin_server_url = $4, failure_timestamp = to_timestamp($5 / 1000.0), reason = $6, error_description = $7`,
      [entityType, entityId, originTimestamp, originServerUrl, failureTimestamp, reason, errorDescription]
    )
  }
}
