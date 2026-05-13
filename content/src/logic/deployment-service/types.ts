import { DeploymentContext, DeploymentFiles, DeploymentResult, LocalDeploymentAuditInfo } from '../../deployment-types'
import { IDeployRateLimiterComponent } from './rate-limiter'

export interface IDeploymentService {
  deployEntity(
    files: DeploymentFiles,
    entityId: string,
    auditInfo: LocalDeploymentAuditInfo,
    context: DeploymentContext
  ): Promise<DeploymentResult>

  /**
   * Test seam: swap the in-process rate limiter. Production code never calls this;
   * test environments use it to install a no-op or a custom rate-limiter on a running
   * server instance. After the deploy-rate-limiter fold there is no public
   * `components.deployRateLimiter` to mutate.
   */
  setRateLimiter(rl: IDeployRateLimiterComponent): void
}

/**
 * @deprecated Alias retained for compatibility while the AppComponents key is still
 * named `deployer`. New code should use `IDeploymentService`.
 */
export type Deployer = IDeploymentService
