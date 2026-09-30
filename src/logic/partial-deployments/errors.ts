/** Why a batch was answered with a retryable 429. */
export type PartialUploadThrottleReason =
  | 'uploads_per_account'
  | 'bytes_per_account'
  | 'bytes_per_server'
  | 'bytes_per_minute'
  | 'entity_rate_limit'
  | 'pointer_conflict'

/**
 * Thrown by the partial-deployments component when a staging request is rejected. The controller maps
 * it to a response carrying `errors` with `statusCode`: 400 for validation, expiry and permission
 * failures; 429 (with `retryAfterSeconds` and `throttleReason`) for the partial-upload quotas, the
 * per-pointer deploy rate limiter and in-process pointer conflicts.
 */
export class InvalidPartialDeploymentError extends Error {
  constructor(
    public readonly errors: string[],
    public readonly statusCode: 400 | 429 = 400,
    // Surfaced as Retry-After on a 429.
    public readonly retryAfterSeconds?: number,
    public readonly throttleReason?: PartialUploadThrottleReason
  ) {
    super(errors.join(', '))
    this.name = 'InvalidPartialDeploymentError'
  }
}
