export class DeploymentQuotaExceededError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('The daily deployment quota for this client is exhausted.')
    this.name = 'DeploymentQuotaExceededError'
  }
}
