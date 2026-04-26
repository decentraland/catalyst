import { IBaseComponent } from '@well-known-components/interfaces'

export type IRetryFailedDeploymentsComponent = IBaseComponent & {
  schedule: () => Promise<void>
}
