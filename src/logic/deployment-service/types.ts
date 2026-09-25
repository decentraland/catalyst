import { Entity, EntityType } from '@dcl/schemas'
import {
  DeploymentContext,
  DeploymentFiles,
  DeploymentResult,
  InvalidResult,
  LocalDeploymentAuditInfo
} from '../../deployment-types'
import { IDeployRateLimiterComponent } from './rate-limiter'

export type DeployEntityOptions = {
  /**
   * When, in ms, the REQUEST_TTL_BACKWARDS freshness bound is measured from. Defaults to now; only a
   * partial upload's finalization passes its admission time.
   */
  requestTtlAnchor?: number
}

/** A deployment's files keyed by content hash, and its parsed entity. */
export type ReadDeployment = {
  files: Map<string, Uint8Array>
  entity: Entity
}

export interface IDeploymentService {
  deployEntity(
    files: DeploymentFiles,
    entityId: string,
    auditInfo: LocalDeploymentAuditInfo,
    context: DeploymentContext,
    options?: DeployEntityOptions
  ): Promise<DeploymentResult>
  /**
   * Hashes a deployment's files and parses its entity file, as deployEntity does before validating it.
   * The returned files can be passed to deployEntity without hashing them again.
   */
  readDeployment(files: DeploymentFiles, entityId: string): Promise<ReadDeployment | InvalidResult>
  /** The local timestamp of the entity's recorded deployment, or `undefined` if it was never deployed. */
  getDeployedEntityTimestamp(entityId: string): Promise<number | undefined>
  /** Whether a deployment of this entity type on these pointers is currently rate limited. */
  isRateLimited(entityType: EntityType, pointers: string[]): boolean
  /** The rate-limit window (seconds) for an entity type, used as a Retry-After hint on a 429. */
  getRateLimitTtlSeconds(entityType: EntityType): number
}

/**
 * Subtype that exposes test-only seams. The factory returns this; `AppComponents.deployer`
 * is typed as the narrower `IDeploymentService` so production code can't accidentally call
 * the seams. Test helpers cast back to `TestableDeploymentService` to reach them.
 */
export interface TestableDeploymentService extends IDeploymentService {
  /**
   * Test seam: swap the in-process rate limiter. Used by integration test helpers to
   * install a no-op (or short-TTL) rate-limiter on a running server instance after
   * `initComponentsWithEnv` has built the real one from env config.
   */
  setRateLimiter(rl: IDeployRateLimiterComponent): void
}

/**
 * @deprecated Alias retained for compatibility while the AppComponents key is still
 * named `deployer`. New code should use `IDeploymentService`.
 */
export type Deployer = IDeploymentService
