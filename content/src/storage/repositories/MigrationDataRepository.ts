import { DeploymentId } from './DeploymentsRepository';
import { Repository } from '@katalyst/content/storage/Repository';

export class MigrationDataRepository {

    constructor(private readonly db: Repository) { }

    saveMigrationData(deploymentId: DeploymentId, originalMetadata: any): Promise<null> {
        return this.db.none('INSERT INTO migration_data (deployment, original_metadata) VALUES ($1, $2)', [deploymentId, originalMetadata])
    }

    async getMigrationData(deploymentIds: DeploymentId[]): Promise<Map<DeploymentId, any>> {
        if (deploymentIds.length === 0) {
            return new Map()
        }
        const queryResult = await this.db.any('SELECT deployment, original_metadata FROM migration_data WHERE deployment IN ($1:list)', [deploymentIds])
        return new Map(queryResult.map(row => [ row.deployment, row.original_metadata ]))
    }
}