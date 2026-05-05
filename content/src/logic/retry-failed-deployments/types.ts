export type IRetryFailedDeploymentsComponent = {
  schedule: () => Promise<void>
  stop: () => Promise<void>
}
