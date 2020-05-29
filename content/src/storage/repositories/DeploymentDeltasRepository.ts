import { Repository } from '@katalyst/content/storage/Repository';
import { DeploymentId } from './DeploymentsRepository';
import { DeploymentResult, DELTA_POINTER_RESULT } from '@katalyst/content/service/pointers/PointerManager';
import { Pointer, EntityId } from '@katalyst/content/service/Entity';

export class DeploymentDeltasRepository {

    constructor(private readonly db: Repository) { }

    async saveDelta(deploymentId: DeploymentId, deploymentResult: DeploymentResult): Promise<void> {
        await this.db.txIf(transaction => {
            const contentPromises = Array.from(deploymentResult.entries())
                .map(([pointer, { before, after }]) => transaction.none('INSERT INTO deployment_deltas (deployment, pointer, before, after) VALUES ($1, $2, $3, $4)', [deploymentId, pointer, before, after]))
            return transaction.batch(contentPromises)
        })
    }

    async getDeltasForDeployments(deploymentIds: DeploymentId[]): Promise<Map<DeploymentId, Map<Pointer, { before: EntityId | undefined, after: DELTA_POINTER_RESULT }>>> {
        const result: Map<DeploymentId, Map<Pointer, { before: EntityId | undefined, after: DELTA_POINTER_RESULT }>> = new Map()
        const deltas = await this.db.any(`
            SELECT deployment, pointer, after, deployments.entity_id AS before
            FROM deployment_deltas
            LEFT JOIN deployments on deployments.id = deployment_deltas.before
            WHERE deployment IN ($1:list)`, [deploymentIds])
        deltas.forEach(({ deployment, pointer, before, after }) => {
            if (!result.has(deployment)) {
                result.set(deployment, new Map())
            }
            result.get(deployment)!!.set(pointer, { before: before ?? undefined, after })
        })
        return result
    }

}