import { AuditInfo } from '../logic/deployment-types'

/**x
 * This version of the service can tell clients about the state of the Metaverse. It assumes that all deployments
 * were done directly to it, and it is not aware that the service lives inside a cluster.
 */
export interface MetaverseContentService {
  deployEntity(
    files: DeploymentFiles,
    entityId: string,
    auditInfo: LocalDeploymentAuditInfo,
    context: DeploymentContext
  ): Promise<DeploymentResult>
}

export type LocalDeploymentAuditInfo = Pick<AuditInfo, 'authChain'>

export type InvalidResult = { errors: string[] }
export function InvalidResult(val: InvalidResult): InvalidResult {
  return val
}

export type DeploymentResult = number | InvalidResult

export type DeploymentFiles = Uint8Array[] | Map<string, Uint8Array>

export function isSuccessfulDeployment(deploymentResult: DeploymentResult): deploymentResult is number {
  return typeof deploymentResult === 'number'
}

export function isInvalidDeployment(deploymentResult: any): deploymentResult is InvalidResult {
  if (deploymentResult && typeof deploymentResult === 'object' && Array.isArray(deploymentResult['errors'])) {
    return true
  }

  return false
}

export enum DeploymentContext {
  LOCAL = 'LOCAL',
  SYNCED = 'SYNCED',
  SYNCED_LEGACY_ENTITY = 'SYNCED_LEGACY_ENTITY',
  FIX_ATTEMPT = 'FIX_ATTEMPT'
}
