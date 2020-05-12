import { DeploymentId } from './DeploymentsRepository';
import { Repository } from '@katalyst/content/storage/Repository';

export class MigrationDataRepository {

    constructor(private readonly db: Repository) { }

    saveMigrationData(deploymentId: DeploymentId, originalMetadata: any): Promise<null> {
        return this.db.none('INSERT INTO migration_data (deployment, original_metadata) VALUES ($1, $2)', [deploymentId, originalMetadata])
    }

    getMigrationData(deploymentId: DeploymentId): Promise<any | null> {
        return this.db.oneOrNone('SELECT original_metadata FROM migration_data WHERE deployment=$1', [deploymentId])
    }
}