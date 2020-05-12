import { Pointer, EntityId, EntityType } from '@katalyst/content/service/Entity';
import { Timestamp } from '@katalyst/content/service/time/TimeSorting';
import { Repository } from '../Repository';
import { DeploymentId } from './DeploymentsRepository';

export class LastDeployedPointersRepository {

    constructor(private readonly db: Repository) { }

    /** Returns active deployments on the given pointers */
    async getActiveDeploymentsOnPointers(entityType: EntityType, pointers: Pointer[]): Promise<Map<Pointer, EntityId | undefined>> {
        const result: { pointer: Pointer, entityId: EntityId | undefined }[] = await this.db.any(`
            SELECT last_deployed_pointers.pointer, deployments.entity_id
            FROM last_deployed_pointers
            LEFT JOIN deployments ON last_deployed_pointers.deployment = deployments.id
            WHERE last_deployed_pointers.pointer IN ($2:list) AND
                last_deployed_pointers.entity_type = $1 AND
                deployments.deleter_deployment IS NULL`, [entityType, pointers])
        return new Map(result.map(({ pointer, entityId }) => [pointer, entityId]))
    }

    /** Returns the last deployments (could be active or not) on the given pointers */
    getLastDeploymentsOnPointers(entityType: EntityType, pointers: Pointer[]): Promise<{ entityId: EntityId, timestamp: Timestamp, pointers: Pointer[], deleted: boolean }[]> {
        return this.db.any(`
            SELECT DISTINCT ON (deployments.entity_id)
                deployments.entity_id,
                deployments.entity_timestamp,
                deployments.entity_pointers,
                CASE WHEN deployments.deleter_deployment IS NULL
                        THEN FALSE
                        ELSE TRUE
                END AS deleted;
            FROM last_deployed_pointers
            JOIN deployments ON last_deployed_pointers.deployment = deployments.id
            WHERE last_deployed_pointers.pointer IN ($2:list) AND
                last_deployed_pointers.entity_type = $1`, [entityType, pointers])
    }

    async setAsLastDeployedOnPointers(deploymentId: DeploymentId, entityType: EntityType, pointers: Pointer[]): Promise<void> {
        await this.db.txIf(transaction => {
            const upserts = pointers.map(pointer => transaction.none(`
                INSERT INTO last_deployed_pointers (deployment, pointer, entity_type)
                VALUES ($1, $2, $3)
                ON CONFLICT CONSTRAINT constraint_name
                DO UPDATE SET deployment = $1`, [deploymentId, pointer, entityType]));

                // AGREGAR CONSTRAINT NAME

            return transaction.batch(upserts)
        })
    }

}
