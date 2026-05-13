import { isSnapshotFailedDeployment } from '../../adapters/failed-deployments'
import { AppComponents } from '../../types'
import { IFailedDeploymentsReporter } from './types'

export function createFailedDeploymentsReporter(
  components: Pick<AppComponents, 'database' | 'failedDeployments'>
): IFailedDeploymentsReporter {
  const { database, failedDeployments } = components

  return {
    async reportFailure(deployment) {
      if (isSnapshotFailedDeployment(deployment)) {
        // Snapshot deployments are persisted. If the entity is already cached we re-report it
        // by deleting and re-inserting inside a single transaction; otherwise a plain insert suffices.
        const reported = await failedDeployments.findFailedDeployment(deployment.entityId)
        if (reported) {
          await database.transaction(async (txDatabase) => {
            await failedDeployments.deleteFailedDeployment(txDatabase, deployment.entityId)
            await failedDeployments.saveSnapshotFailedDeployment(txDatabase, deployment)
          }, 'tx_failed_deployments')
        } else {
          await failedDeployments.saveSnapshotFailedDeployment(database, deployment)
        }
      }
      // Apply the cache update only after the SQL has fully committed. If we updated the
      // cache inside the SQL methods, a multi-step transaction whose second statement
      // throws would leave the cache out of sync with the rolled-back DB.
      await failedDeployments.cacheFailedDeployment(deployment)
    }
  }
}
