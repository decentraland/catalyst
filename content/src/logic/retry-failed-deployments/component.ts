import { IJobComponent } from '@dcl/job-component'
import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { IRetryFailedDeploymentsComponent } from './types'

/**
 * Thin scheduler around a job component. The job is created in components.ts so all
 * recurring tasks share the same lifecycle wiring. Synchronization bootstrap calls
 * `schedule()` once the initial bootstrap has finished.
 */
export function createRetryFailedDeploymentsScheduler(job: IJobComponent): IRetryFailedDeploymentsComponent {
  return {
    async schedule() {
      await job[START_COMPONENT]?.(undefined as any)
    },
    async stop() {
      await job[STOP_COMPONENT]?.()
    }
  }
}
