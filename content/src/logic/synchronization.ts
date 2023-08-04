import { future } from 'fp-future'
import { AppComponents } from '../types.js'

export async function startSynchronization(
  components: Pick<
    AppComponents,
    | 'logs'
    | 'contentCluster'
    | 'downloadQueue'
    | 'batchDeployer'
    | 'metrics'
    | 'retryFailedDeployments'
    | 'synchronizer'
    | 'synchronizationState'
  >
) {
  const syncJob = await components.synchronizer.syncWithServers(
    new Set(components.contentCluster.getAllServersInCluster())
  )
  const bootstrapFinished = future<void>()
  await syncJob.onInitialBootstrapFinished(async () => {
    await components.downloadQueue.onIdle()
    await components.batchDeployer.onIdle()
    components.synchronizationState.toSyncing()
    // Configure retry for failed deployments
    components.retryFailedDeployments.schedule().catch(() => {
      components.logs
        .getLogger('retryFailedDeployments')
        .error('There was an error during the retry of failed deployments.')
    })
    components.contentCluster.onSyncFinished(components.synchronizer.syncWithServers)
    bootstrapFinished.resolve()
  })
  return [syncJob, bootstrapFinished]
}
