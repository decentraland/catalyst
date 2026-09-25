/**
 * Thrown by the partial-deployments component when a staging request is rejected. The controller maps
 * it to a response carrying `errors` with `statusCode`: 400 for validation, expiry and quota failures;
 * 429 (with `retryAfterSeconds`) only for the per-pointer deploy rate limiter and in-process pointer
 * conflicts.
 */
export class InvalidPartialDeploymentError extends Error {
  constructor(
    public readonly errors: string[],
    public readonly statusCode: 400 | 429 = 400,
    // Surfaced as Retry-After on a 429.
    public readonly retryAfterSeconds?: number
  ) {
    super(errors.join(', '))
    this.name = 'InvalidPartialDeploymentError'
  }
}
