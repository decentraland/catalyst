import { EntityType, EntityId } from '@katalyst/content/service/Entity';
import { Repository } from '@katalyst/content/storage/Repository';
import { Timestamp } from '@katalyst/content/service/time/TimeSorting';
import { ServerAddress } from '@katalyst/content/service/synchronization/clients/contentserver/ContentServerClient';
import { FailureReason, FailedDeployment } from '@katalyst/content/service/errors/FailedDeploymentsManager';

export class FailedDeploymentsRepository {

    constructor(private readonly db: Repository) { }

    getAllFailedDeployments(): Promise<FailedDeployment[]> {
        return this.db.any(`
            SELECT
                entity_type,
                entity_id,
                origin_timestamp,
                origin_server_url,
                failure_timestamp,
                reason,
                error_description
            FROM failed_deployments`)
    }

    findFailedDeployment(entityType: EntityType, entityId: EntityId): Promise<FailedDeployment | null> {
        return this.db.oneOrNone(`
            SELECT
                entity_type,
                entity_id,
                origin_timestamp,
                origin_server_url,
                failure_timestamp,
                reason,
                error_description
            FROM failed_deployments
            WHERE entity_type = $1 and entity_id = $2`,
            [entityType, entityId])
    }

    reportSuccessfulDeployment(entityType: EntityType, entityId: EntityId): Promise<null> {
        return this.db.none('DELETE FROM failed_deployments WHERE entity_type = $1 AND entity_id = $2', [entityType, entityId])
    }

    reportFailure(entityType: EntityType,
        entityId: EntityId,
        originTimestamp: Timestamp,
        originServerUrl: ServerAddress,
        failureTimestamp: Timestamp,
        reason: FailureReason,
        errorDescription: string | undefined): Promise<null> {
            return this.db.none(
                `INSERT INTO failed_deployments (
                    entity_type,
                    entity_id,
                    origin_timestamp,
                    origin_server_url,
                    failure_timestamp,
                    reason,
                    error_description
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT CONSTRAINT constraint_name
                DO UPDATE SET origin_timestamp = $3, origin_server_url = $4, failure_timestamp = $5, reason = $6, error_description = $7`,
                [entityType, entityId, originTimestamp, originServerUrl, failureTimestamp, reason, errorDescription]);

            // ^ SET CONSTRAINT NAME
    }


}