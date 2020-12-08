import { DeploymentBase as ControllerDeployment } from 'dcl-catalyst-commons'
import { Deployment } from '../service/deployments/DeploymentManager'
import { DeploymentField } from './Controller'

export class ControllerDeploymentFactory {
  static deployment2ControllerEntity<T extends ControllerDeployment>(
    deployment: Deployment,
    fields: DeploymentField[]
  ): T {
    const { entityType, entityId, entityTimestamp, deployedBy, pointers, auditInfo } = deployment
    const result: any = { entityType, entityId, entityTimestamp, deployedBy }
    if (fields.includes(DeploymentField.POINTERS)) {
      result.pointers = pointers
    }
    if (deployment.content && fields.includes(DeploymentField.CONTENT)) {
      result.content = Array.from(deployment.content.entries()).map(([key, hash]) => ({ key, hash }))
    }
    if (deployment.metadata && fields.includes(DeploymentField.METADATA)) {
      result.metadata = deployment.metadata
    }
    if (fields.includes(DeploymentField.AUDIT_INFO)) {
      result.auditInfo = auditInfo
    }
    return result
  }
}
