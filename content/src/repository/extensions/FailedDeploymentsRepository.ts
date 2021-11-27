import { EntityId, EntityType, Timestamp } from 'dcl-catalyst-commons'
import { AuthChain } from 'dcl-crypto'
import { Database } from '../../repository/Database'
import { FailedDeployment, FailureReason } from '../../service/errors/FailedDeploymentsManager'

export class FailedDeploymentsRepository {
  constructor(private readonly db: Database) {}

  getAllFailedDeployments(): Promise<FailedDeployment[]> {
    return this.db.map(
      ` SELECT
            entity_type,
            entity_id,
            date_part('epoch', failure_timestamp) * 1000 AS failure_timestamp,
            reason,
            error_description,
            auth_chain
        FROM failed_deployments
        ORDER BY failure_timestamp DESC
      `,
      [],
      (row) => ({
        entityType: row.entity_type,
        entityId: row.entity_id,
        failureTimestamp: row.failure_timestamp,
        reason: row.reason,
        errorDescription: row.error_description ?? undefined,
        authChain: row.auth_chain ?? null
      })
    )
  }

  findFailedDeployment(entityType: EntityType, entityId: EntityId): Promise<FailedDeployment | null> {
    return this.db.oneOrNone(
      ` SELECT
            entity_type,
            entity_id,
            date_part('epoch', failure_timestamp) * 1000 AS failure_timestamp,
            reason,
            error_description,
            auth_chain
        FROM failed_deployments
        WHERE entity_type = $1 and entity_id = $2
      `,
      [entityType, entityId],
      (row) =>
        row && {
          entityType: row.entity_type,
          entityId: row.entity_id,
          failureTimestamp: row.failure_timestamp,
          reason: row.reason,
          errorDescription: row.error_description ?? undefined,
          authChain: row.auth_chain ?? null
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
    authChain: AuthChain,
    errorDescription: string | undefined
  ): Promise<null> {
    return this.db.none(
      ` INSERT INTO failed_deployments (
          entity_type,
          entity_id,
          failure_timestamp,
          reason,
          error_description,
          auth_chain
        ) VALUES (
          $(entityType),
          $(entityId),
          to_timestamp($(failureTimestamp) / 1000.0),
          $(reason),
          $(errorDescription),
          $(authChain:json)
        )
        ON CONFLICT ON CONSTRAINT failed_deployments_uniq_entity_id_entity_type
        DO UPDATE SET
          failure_timestamp = to_timestamp($(failureTimestamp) / 1000.0),
          reason = $(reason),
          error_description = $(errorDescription),
          auth_chain = $(authChain:json)
      `,
      { entityType, entityId, failureTimestamp, reason, errorDescription, authChain }
    )
  }
}
