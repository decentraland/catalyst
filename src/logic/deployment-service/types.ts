import { DeploymentContext, DeploymentFiles, DeploymentResult, LocalDeploymentAuditInfo } from '../../deployment-types'
import { IDeployRateLimiterComponent } from './rate-limiter'

export interface IDeploymentService {
  deployEntity(
    files: DeploymentFiles,
    entityId: string,
    auditInfo: LocalDeploymentAuditInfo,
    context: DeploymentContext
  ): Promise<DeploymentResult>
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
