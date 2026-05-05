import { DeploymentContext, DeploymentFiles, DeploymentResult, LocalDeploymentAuditInfo } from '../../deployment-types'

export interface IDeploymentService {
  deployEntity(
    files: DeploymentFiles,
    entityId: string,
    auditInfo: LocalDeploymentAuditInfo,
    context: DeploymentContext
  ): Promise<DeploymentResult>
}

/**
 * @deprecated Alias retained for compatibility while the AppComponents key is still
 * named `deployer`. New code should use `IDeploymentService`.
 */
export type Deployer = IDeploymentService
