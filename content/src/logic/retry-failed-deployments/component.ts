import { IJobComponent } from '@dcl/job-component'
import { IBaseComponent, START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { IRetryFailedDeploymentsComponent } from './types'

/**
 * Wraps the retry-failed-deployments job so it does NOT start with the rest of the
 * components. Retrying before initial sync has bootstrapped would race against
 * deployments that are still being downloaded for the first time and surface them
 * as failures.
 *
 * Instead of exposing `START_COMPONENT` (which the WKC framework's `startComponents()`
 * would auto-invoke), we expose `schedule()`. The sync orchestrator calls it from
 * `onInitialBootstrapFinished` — see `logic/sync-orchestrator/component.ts`.
 */

// `createJobComponent`'s start ignores the options arg today, but the
// IBaseComponent contract requires one. Hand it a typed no-op stub so we never
// pass `undefined as any` and keep callers safe if the job-component ever
// starts using the options.
const NOOP_START_OPTIONS: IBaseComponent.ComponentStartOptions = {
  started: () => true,
  live: () => true,
  getComponents: () => ({})
}

export function createRetryFailedDeploymentsScheduler(job: IJobComponent): IRetryFailedDeploymentsComponent {
  return {
    // Manually triggers the underlying job's start. Called once, after bootstrap.
    async schedule() {
      await job[START_COMPONENT]?.(NOOP_START_OPTIONS)
    },
    // Stops the underlying job on shutdown. Safe to call even if `schedule()` was
    // never invoked (e.g. when synchronization is disabled).
    async stop() {
      await job[STOP_COMPONENT]?.()
    }
  }
}
