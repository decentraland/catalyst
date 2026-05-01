import { createInMemoryCacheComponent } from '@dcl/memory-cache-component'
import { deleteFailedDeployment, getSnapshotFailedDeployments } from '../failed-deployments-repository'
import { AppComponents } from '../../types'
import { FailedDeployment, IFailedDeploymentsComponent } from './types'

const FAILED_DEPLOYMENTS_METRIC = 'dcl_content_server_failed_deployments'

export async function createFailedDeployments(
  components: Pick<AppComponents, 'metrics' | 'database'>
): Promise<IFailedDeploymentsComponent> {
  const { metrics, database } = components

  // No TTL: the cache mirrors the failed_deployments table for the lifetime of the process,
  // and is enumerated by getAllFailedDeployments. Implicit eviction would silently drop entries
  // from that enumeration. The cap is high enough to never bind in practice.
  const cache = createInMemoryCacheComponent({ max: 1_000_000, ttl: 0 })

  async function observeSize(): Promise<void> {
    const keys = await cache.keys()
    metrics.observe(FAILED_DEPLOYMENTS_METRIC, {}, keys.length)
  }

  return {
    async start() {
      const failedDeployments = await getSnapshotFailedDeployments(database)
      await Promise.all(failedDeployments.map((deployment) => cache.set(deployment.entityId, deployment)))
      await observeSize()
    },
    async getAllFailedDeployments() {
      const keys = await cache.keys()
      const values = await Promise.all(keys.map((key) => cache.get<FailedDeployment>(key)))
      return values.filter((value): value is FailedDeployment => value !== null)
    },
    async findFailedDeployment(entityId: string) {
      const result = await cache.get<FailedDeployment>(entityId)
      return result ?? undefined
    },
    async removeFailedDeployment(entityId: string) {
      const found = await cache.get<FailedDeployment>(entityId)
      if (found) {
        await deleteFailedDeployment(database, entityId)
        await cache.remove(entityId)
        await observeSize()
      }
    },
    async cacheFailedDeployment(deployment: FailedDeployment) {
      await cache.set(deployment.entityId, deployment)
      await observeSize()
    }
  }
}
