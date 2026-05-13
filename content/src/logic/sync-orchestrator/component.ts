import { IJobComponent } from '@dcl/job-component'
import { IBaseComponent, START_COMPONENT } from '@well-known-components/interfaces'
import future from 'fp-future'
import { AppComponents } from '../../types'
import { ISyncOrchestrator, State, SyncJob } from './types'

// `createJobComponent`'s start ignores the options arg today, but the
// IBaseComponent contract requires one. Hand it a typed no-op stub so we never
// pass `undefined as any` and keep callers safe if the job-component ever
// starts using the options.
const NOOP_START_OPTIONS: IBaseComponent.ComponentStartOptions = {
  started: () => true,
  live: () => true,
  getComponents: () => ({})
}

export function createSyncOrchestrator(
  components: Pick<
    AppComponents,
    'logs' | 'contentCluster' | 'downloadQueue' | 'batchDeployer' | 'metrics' | 'synchronizer'
  >,
  retryFailedDeploymentsJob: IJobComponent
): ISyncOrchestrator {
  let state = State.BOOTSTRAPPING
  components.metrics.observe('dcl_content_server_sync_state', {}, 0)

  function toSyncing() {
    if (state === State.SYNCING) return
    components.logs.getLogger('sync-orchestrator').info('Switching to syncing state...')
    state = State.SYNCING
    components.metrics.observe('dcl_content_server_sync_state', {}, 1)
  }

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
        toSyncing()
        // Start the retry-failed-deployments job — deferred until bootstrap finishes so
        // retries don't race against initial-sync deployments that are still downloading.
        // The job is intentionally NOT registered in AppComponents (the WKC framework would
        // auto-start it during `startComponents()`); we own its lifecycle here.
        retryFailedDeploymentsJob[START_COMPONENT]?.(NOOP_START_OPTIONS).catch(() => {
          components.logs
            .getLogger('retryFailedDeployments')
            .error('There was an error during the retry of failed deployments.')
        })
        components.contentCluster.onSyncFinished(components.synchronizer.syncWithServers)
        bootstrapFinished.resolve()
      })
      return [syncJob, bootstrapFinished]
    },
    getState() {
      return state
    },
    toSyncing
  }
}
