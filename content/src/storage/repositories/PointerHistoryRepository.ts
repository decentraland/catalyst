import { Entity } from '@katalyst/content/service/Entity';
import { Repository } from '@katalyst/content/storage/Repository';
import { DeploymentId } from '@katalyst/content/storage/repositories/DeploymentsRepository';

export class PointerHistoryRepository {

    constructor(private readonly db: Repository) { }

    /** Return a map from overwritten to overwriter  */
    async calculateOverwrites(entity: Entity): Promise<{ overwrote: Set<DeploymentId>, overwrittenBy: DeploymentId | null}> {
        return this.db.taskIf(async task => {
            const overwrote: DeploymentId[] = await task.any(`
                SELECT DISTINCT ON (pointer_history.pointer) deployments.id
                FROM pointer_history
                LEFT JOIN deployments ON pointer_history.deployment = deployments.id
                WHERE pointer_history.entity_type = $1 AND
                    pointer_history.pointer IN ($2:list) AND
                    deployments.entity_timestamp <= $3
                ORDER BY deployments.entity_timestamp, deployments.entity_id DESC`,
                [entity.type, entity.pointers, entity.timestamp])

            const overwrittenBy: DeploymentId | null = await task.oneOrNone(`
                SELECT deployments.id
                FROM pointer_history
                LEFT JOIN deployments ON pointer_history.deployment = deployments.id
                WHERE pointer_history.entity_type = $1 AND
                    pointer_history.pointer IN ($2:list) AND
                    deployments.entity_timestamp >= $3
                ORDER BY deployments.entity_timestamp, deployments.entity_id ASC
                LIMIT 1`,
                [entity.type, entity.pointers, entity.timestamp])

            return {
                overwrote: new Set(overwrote),
                overwrittenBy,
            }
        })
    }

    async addToHistory(deploymentId: DeploymentId, entity: Entity): Promise<void> {
        await this.db.txIf(transaction => {
            const updates = entity.pointers.map(pointer => transaction.none('INSERT INTO pointer_history (deployment, pointer, entity_type) VALUES ($1, $2, $3)', [deploymentId, pointer, entity.type]))
            return transaction.batch(updates)
        })
    }

}