import { Deployment, DeploymentBase as ControllerDeployment } from 'dcl-catalyst-commons'
import { DeploymentField } from './Controller'

export class ControllerDeploymentFactory {
  static deployment2ControllerEntity<T extends ControllerDeployment>(
    deployment: Deployment,
    fields: DeploymentField[]
  ): T {
    const { pointers, auditInfo, content, metadata, ...other } = deployment
    const result: any = { ...other }
    if (fields.includes(DeploymentField.POINTERS)) {
      result.pointers = pointers
    }
    if (content && fields.includes(DeploymentField.CONTENT)) {
      result.content = content
    }
    if (metadata && fields.includes(DeploymentField.METADATA)) {
      result.metadata = metadata
    }
    if (fields.includes(DeploymentField.AUDIT_INFO)) {
      result.auditInfo = auditInfo
    }
    result.localTimestamp = auditInfo.localTimestamp
    return result
  }
}
