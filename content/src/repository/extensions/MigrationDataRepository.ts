import { Database } from '@katalyst/content/repository/Database'
import { DeploymentId } from './DeploymentsRepository'

export class MigrationDataRepository {
  constructor(private readonly db: Database) {}

  saveMigrationData(deploymentId: DeploymentId, originalMetadata: any): Promise<null> {
    return this.db.none('INSERT INTO migration_data (deployment, original_metadata) VALUES ($1, $2)', [
      deploymentId,
      originalMetadata
    ])
  }

  async getMigrationData(deploymentIds: DeploymentId[]): Promise<Map<DeploymentId, any>> {
    if (deploymentIds.length === 0) {
      return new Map()
    }
    const queryResult = await this.db.any(
      'SELECT deployment, original_metadata FROM migration_data WHERE deployment IN ($1:list)',
      [deploymentIds]
    )
    return new Map(queryResult.map((row) => [row.deployment, row.original_metadata]))
  }
}
