import { IJobComponent } from '@dcl/job-component'
import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'

export type IRetryFailedDeploymentsComponent = {
  schedule: () => Promise<void>
  stop: () => Promise<void>
}

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
