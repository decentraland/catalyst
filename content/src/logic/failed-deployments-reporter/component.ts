import { isSnapshotFailedDeployment } from '../../adapters/failed-deployments-cache'
import { AppComponents } from '../../types'
import { IFailedDeploymentsReporter } from './types'

export function createFailedDeploymentsReporter(
  components: Pick<AppComponents, 'database' | 'failedDeployments' | 'failedDeploymentsRepository'>
): IFailedDeploymentsReporter {
  const { database, failedDeployments, failedDeploymentsRepository } = components

  return {
    async reportFailure(deployment) {
      if (isSnapshotFailedDeployment(deployment)) {
        // Snapshot deployments are persisted. If the entity is already in the cache we re-report it
        // by deleting and re-inserting inside a single transaction; otherwise a plain insert suffices.
        const reported = await failedDeployments.findFailedDeployment(deployment.entityId)
        if (reported) {
          await database.transaction(async (txDatabase) => {
            await failedDeploymentsRepository.deleteFailedDeployment(txDatabase, deployment.entityId)
            await failedDeploymentsRepository.saveSnapshotFailedDeployment(txDatabase, deployment)
          }, 'tx_failed_deployments')
        } else {
          await failedDeploymentsRepository.saveSnapshotFailedDeployment(database, deployment)
        }
      }
      await failedDeployments.cacheFailedDeployment(deployment)
    }
  }
}
