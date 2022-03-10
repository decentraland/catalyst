import { Database } from '../../repository/Database'
import { DeploymentResult } from '../../service/pointers/PointerManager'
import { DeploymentId } from './DeploymentsRepository'

export class DeploymentPointerChangesRepository {
  constructor(private readonly db: Database) {}

  async savePointerChanges(deploymentId: DeploymentId, deploymentResult: DeploymentResult): Promise<void> {
    await this.db.txIf((transaction) => {
      const contentPromises = Array.from(deploymentResult.entries()).map(([pointer, { before, after }]) =>
        transaction.none('INSERT INTO deployment_deltas (deployment, pointer, before, after) VALUES ($1, $2, $3, $4)', [
          deploymentId,
          pointer,
          before,
          after
        ])
      )
      return transaction.batch(contentPromises)
    })
  }
}
