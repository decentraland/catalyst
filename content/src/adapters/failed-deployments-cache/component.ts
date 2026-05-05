import { AppComponents } from '../../types'
import { FailedDeployment, IFailedDeploymentsComponent } from './types'

const FAILED_DEPLOYMENTS_METRIC = 'dcl_content_server_failed_deployments'

export async function createFailedDeployments(
  components: Pick<AppComponents, 'metrics' | 'database' | 'failedDeploymentsRepository'>
): Promise<IFailedDeploymentsComponent> {
  const { metrics, database, failedDeploymentsRepository } = components

  // In-process mirror of the failed_deployments table. Loaded once at start(),
  // updated on every cache/remove call. The IFailedDeploymentsComponent surface
  // is async to match the rest of the WKC component contract; the underlying
  // Map is synchronous.
  const failedDeploymentsByEntityId: Map<string, FailedDeployment> = new Map()

  function observeSize(): void {
    metrics.observe(FAILED_DEPLOYMENTS_METRIC, {}, failedDeploymentsByEntityId.size)
  }

  return {
    async start() {
      const failedDeployments = await failedDeploymentsRepository.getSnapshotFailedDeployments(database)
      for (const deployment of failedDeployments) {
        failedDeploymentsByEntityId.set(deployment.entityId, deployment)
      }
      observeSize()
    },
    async getAllFailedDeployments() {
      return Array.from(failedDeploymentsByEntityId.values())
    },
    async findFailedDeployment(entityId: string) {
      return failedDeploymentsByEntityId.get(entityId)
    },
    async removeFailedDeployment(entityId: string) {
      const found = failedDeploymentsByEntityId.get(entityId)
      if (found) {
        await failedDeploymentsRepository.deleteFailedDeployment(database, entityId)
        failedDeploymentsByEntityId.delete(entityId)
        observeSize()
      }
    },
    async cacheFailedDeployment(deployment: FailedDeployment) {
      failedDeploymentsByEntityId.set(deployment.entityId, deployment)
      observeSize()
    }
  }
}
