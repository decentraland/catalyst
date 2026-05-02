import { createInMemoryCacheComponent } from '@dcl/memory-cache-component'
import { AppComponents } from '../../types'
import { FailedDeployment, IFailedDeploymentsComponent } from './types'

const FAILED_DEPLOYMENTS_METRIC = 'dcl_content_server_failed_deployments'

// All deployments live as fields under a single hash so getAllFailedDeployments is one
// cache call (Object.values of the hash) instead of keys() + N gets, and write/remove
// stay O(1) per call.
const FAILED_DEPLOYMENTS_HASH = 'failed-deployments'

export async function createFailedDeployments(
  components: Pick<AppComponents, 'metrics' | 'database' | 'failedDeploymentsRepository'>
): Promise<IFailedDeploymentsComponent> {
  const { metrics, database, failedDeploymentsRepository } = components

  // No TTL: the cache mirrors the failed_deployments table for the lifetime of the process,
  // and is enumerated by getAllFailedDeployments. Implicit eviction would silently drop entries
  // from that enumeration. The cap is high enough to never bind in practice.
  const cache = createInMemoryCacheComponent({ max: 1_000_000, ttl: 0 })

  async function observeSize(): Promise<void> {
    const all = await cache.getAllHashFields<FailedDeployment>(FAILED_DEPLOYMENTS_HASH)
    metrics.observe(FAILED_DEPLOYMENTS_METRIC, {}, Object.keys(all).length)
  }

  return {
    async start() {
      const failedDeployments = await failedDeploymentsRepository.getSnapshotFailedDeployments(database)
      for (const deployment of failedDeployments) {
        await cache.setInHash(FAILED_DEPLOYMENTS_HASH, deployment.entityId, deployment)
      }
      await observeSize()
    },
    async getAllFailedDeployments() {
      const all = await cache.getAllHashFields<FailedDeployment>(FAILED_DEPLOYMENTS_HASH)
      return Object.values(all)
    },
    async findFailedDeployment(entityId: string) {
      const result = await cache.getFromHash<FailedDeployment>(FAILED_DEPLOYMENTS_HASH, entityId)
      return result ?? undefined
    },
    async removeFailedDeployment(entityId: string) {
      const found = await cache.getFromHash<FailedDeployment>(FAILED_DEPLOYMENTS_HASH, entityId)
      if (found) {
        await failedDeploymentsRepository.deleteFailedDeployment(database, entityId)
        await cache.removeFromHash(FAILED_DEPLOYMENTS_HASH, entityId)
        await observeSize()
      }
    },
    async cacheFailedDeployment(deployment: FailedDeployment) {
      await cache.setInHash(FAILED_DEPLOYMENTS_HASH, deployment.entityId, deployment)
      await observeSize()
    }
  }
}
