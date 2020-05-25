import { Pointer, EntityId, EntityType } from '@katalyst/content/service/Entity';
import { Timestamp } from '@katalyst/content/service/time/TimeSorting';
import { Repository } from '../Repository';
import { DeploymentId } from './DeploymentsRepository';

export class LastDeployedPointersRepository {

    constructor(private readonly db: Repository) { }

    /** Returns active deployments on the given pointers */
    async getActiveDeploymentsOnPointers(entityType: EntityType, pointers: Pointer[]): Promise<Map<Pointer, EntityId | undefined>> {
        if (pointers.length === 0) {
            return new Map()
        }
        const result: { pointer: Pointer, entityId: EntityId | undefined }[] = await this.db.map(`
            SELECT last_deployed_pointers.pointer, deployments.entity_id
            FROM last_deployed_pointers
            LEFT JOIN deployments ON last_deployed_pointers.deployment = deployments.id
            WHERE last_deployed_pointers.pointer IN ($2:list) AND
                last_deployed_pointers.entity_type = $1 AND
                deployments.deleter_deployment IS NULL`, [entityType, pointers], row => ({
                    pointer: row.pointer,
                    entityId: row.entity_id,
                }))
        return new Map(result.map(({ pointer, entityId }) => [pointer, entityId]))
    }

    /** Returns the last deployments (could be active or not) on the given pointers */
    getLastDeploymentsOnPointers(entityType: EntityType, pointers: Pointer[]): Promise<{ deployment: DeploymentId, entityId: EntityId, timestamp: Timestamp, pointers: Pointer[], deleted: boolean }[]> {
        if (pointers.length === 0) {
            return Promise.resolve([])
        }
        return this.db.map(`
            SELECT DISTINCT ON (deployments.id)
                deployments.id,
                deployments.entity_id,
                deployments.entity_timestamp,
                deployments.entity_pointers,
                CASE WHEN deployments.deleter_deployment IS NULL
                    THEN FALSE
                    ELSE TRUE
                END AS deleted
            FROM last_deployed_pointers
            JOIN deployments ON last_deployed_pointers.deployment = deployments.id
            WHERE last_deployed_pointers.pointer IN ($2:list) AND
                last_deployed_pointers.entity_type = $1
            ORDER BY deployments.id`, [entityType, pointers], row => ({
                deployment: row.id,
                entityId: row.entity_id,
                timestamp: row.entity_timestamp,
                pointers: row.entity_pointers,
                deleted: row.deleted,
            }))
    }

    async setAsLastDeployedOnPointers(deploymentId: DeploymentId, entityType: EntityType, pointers: Pointer[]): Promise<void> {
        await this.db.txIf(transaction => {
            const upserts = pointers.map(pointer => transaction.none(`
                INSERT INTO last_deployed_pointers (deployment, pointer, entity_type)
                VALUES ($1, $2, $3)
                ON CONFLICT ON CONSTRAINT last_deployed_pointers_uniq_pointer_entity_type
                DO UPDATE SET deployment = $1`, [deploymentId, pointer, entityType]));

            return transaction.batch(upserts)
        })
    }

}
