import future from 'fp-future'
import { AppComponents } from '../../types'
import { ISyncOrchestrator, SyncJob } from './types'

export function createSyncOrchestrator(
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
): ISyncOrchestrator {
  return {
    // NOTE: do NOT rename this method to `start` — the WKC lifecycle framework's legacy
    // fallback auto-invokes any `.start()` on registered components during
    // `startComponents()`, which would kick off cluster sync before the rest of the system
    // is ready (and against the empty test DAO in integration tests). `service.ts` calls
    // this explicitly after `startComponents()` has completed.
    async synchronize() {
      const syncJob: SyncJob = await components.synchronizer.syncWithServers(
        new Set(components.contentCluster.getAllServersInCluster())
      )
      const bootstrapFinished = future<void>()
      await syncJob.onInitialBootstrapFinished(async () => {
        await components.downloadQueue.onIdle()
        await components.batchDeployer.onIdle()
        components.synchronizationState.toSyncing()
        // Configure retry for failed deployments — deferred until bootstrap finishes so
        // retries don't race against initial-sync deployments that are still downloading.
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
  }
}
