/** Thrown inside the deployment transaction when it would commit after its deadline, rolling it back. */
export class DeploymentDeadlineExceededError extends Error {
  constructor() {
    super('This upload expired before it could be published. Create a new entity with a fresh timestamp.')
    this.name = 'DeploymentDeadlineExceededError'
  }
}
