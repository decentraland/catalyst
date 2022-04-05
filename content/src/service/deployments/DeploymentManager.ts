import { AuditInfo, Entity } from 'dcl-catalyst-commons'
import { ContentFilesRepository } from '../../repository/extensions/ContentFilesRepository'
import { DeploymentId, DeploymentsRepository } from '../../repository/extensions/DeploymentsRepository'

export class DeploymentManager {
  async getEntityById(
    deploymentsRepository: DeploymentsRepository,
    entityId: string
  ): Promise<
    | {
        entityId: any
        localTimestamp: any
      }
    | undefined
  > {
    return deploymentsRepository.getEntityById(entityId)
  }

  async saveDeployment(
    deploymentsRepository: DeploymentsRepository,
    contentRepository: ContentFilesRepository,
    entity: Entity,
    auditInfo: AuditInfo,
    overwrittenBy: DeploymentId | null
  ): Promise<DeploymentId> {
    const deploymentId = await deploymentsRepository.saveDeployment(entity, auditInfo, overwrittenBy)

    if (entity.content) {
      await contentRepository.saveContentFiles(deploymentId, entity.content)
    }

    return deploymentId
  }

  setEntitiesAsOverwritten(
    deploymentsRepository: DeploymentsRepository,
    overwritten: Set<DeploymentId>,
    overwrittenBy: DeploymentId
  ): Promise<void> {
    return deploymentsRepository.setEntitiesAsOverwritten(overwritten, overwrittenBy)
  }
}
