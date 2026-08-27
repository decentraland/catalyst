import { EntityType } from '@dcl/schemas'
import { DeploymentQuotaWindow } from './types'

/**
 * Thrown when a client has spent its budget for an entity type in one of the windows. The window and
 * the limit are carried for the metric and the operator-facing log; the HTTP response deliberately
 * discloses only `Retry-After`, matching the fleet's rate limit convention.
 */
export class DeploymentQuotaExceededError extends Error {
  constructor(
    public readonly entityType: EntityType,
    public readonly window: DeploymentQuotaWindow,
    public readonly limit: number,
    public readonly retryAfterSeconds: number
  ) {
    super(
      `Deployment quota exceeded for '${entityType}': ${limit} per ${window} from one client address. ` +
        `Retry in ${retryAfterSeconds} seconds.`
    )
    this.name = 'DeploymentQuotaExceededError'
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Thrown while the component is built, so a bad quota fails at startup instead of silently rejecting
 * every deployment or none of them.
 */
export class InvalidDeploymentQuotaConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDeploymentQuotaConfigurationError'
    Error.captureStackTrace(this, this.constructor)
  }
}
