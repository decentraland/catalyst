/**
 * Thrown by the partial-deployments component when a staging request is invalid (bad hash, unsupported
 * entity type, over budget, failed validation, ...). The controller maps it to a response carrying the
 * `errors` array with `statusCode` (default 400, mirroring a failed full deployment).
 *
 * `statusCode` is 429 for transient conditions (rate limiting) so a client can tell a retryable
 * rejection from a terminal validation error.
 */
export class InvalidPartialDeploymentError extends Error {
  constructor(public readonly errors: string[], public readonly statusCode: 400 | 429 = 400) {
    super(errors.join(', '))
    this.name = 'InvalidPartialDeploymentError'
  }
}
