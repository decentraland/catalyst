import { IFuture } from 'fp-future'
import { SynchronizerComponent } from '@dcl/snapshots-fetcher'

export type SyncJob = Awaited<ReturnType<SynchronizerComponent['syncWithServers']>>

export type ISyncOrchestrator = {
  /**
   * Kick off the cluster synchronization job once at server startup. Subscribes to the
   * initial-bootstrap-finished hook to flip the synchronization state to `SYNCING`,
   * schedule failed-deployment retries, and register the cluster's sync-finished callback.
   * Returns the underlying sync job and a future that resolves once the initial bootstrap
   * is complete — tests use the latter to wait for steady state before asserting.
   *
   * Named `synchronize` rather than `start` so the WKC lifecycle framework's legacy
   * auto-start (which calls any `.start()` method on registered components) does not
   * invoke us at `startComponents()` time. The orchestrator must run AFTER all other
   * components have started — `service.ts` calls this explicitly.
   */
  synchronize(): Promise<[SyncJob, IFuture<void>]>
}
