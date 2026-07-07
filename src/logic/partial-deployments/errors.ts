/**
 * Thrown by the partial-deployments component when a staging request is invalid (bad hash, unsupported
 * entity type, over budget, failed validation, ...). The controller maps it to a 400 response carrying
 * the `errors` array, mirroring the shape of a failed full deployment.
 */
export class InvalidPartialDeploymentError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join(', '))
    this.name = 'InvalidPartialDeploymentError'
  }
}
