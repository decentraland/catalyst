import { Repository } from '@katalyst/content/storage/Repository';
import { DeploymentId } from './DeploymentsRepository';
import { DeploymentResult } from '@katalyst/content/service/pointers/PointerManager';

export class DeploymentDeltasRepository {

    constructor(private readonly db: Repository) { }

    async saveDelta(deploymentId: DeploymentId, deploymentResult: DeploymentResult): Promise<void> {
        await this.db.txIf(transaction => {
            const contentPromises = Array.from(deploymentResult.entries())
                .map(([pointer, { before, after }]) => transaction.none('INSERT INTO deployment_deltas (deployment, pointer, before, after) VALUES ($1, $2, $3, $4)', [deploymentId, pointer, before, after]))
            return transaction.batch(contentPromises)
        })
    }

}