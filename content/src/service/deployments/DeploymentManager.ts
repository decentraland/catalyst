import { AuditInfo, Entity, EntityId } from 'dcl-catalyst-commons'
import { ContentFilesRepository } from '../../repository/extensions/ContentFilesRepository'
import { DeploymentPointerChangesRepository } from '../../repository/extensions/DeploymentPointerChangesRepository'
import { DeploymentId, DeploymentsRepository } from '../../repository/extensions/DeploymentsRepository'
import { MigrationDataRepository } from '../../repository/extensions/MigrationDataRepository'
import { DeploymentResult } from '../pointers/PointerManager'

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
    migrationDataRepository: MigrationDataRepository,
    contentRepository: ContentFilesRepository,
    entity: Entity,
    auditInfo: AuditInfo,
    overwrittenBy: EntityId | null
  ): Promise<DeploymentId> {
    const deploymentId = await deploymentsRepository.saveDeployment(entity, auditInfo, overwrittenBy)
    if (auditInfo.migrationData) {
      await migrationDataRepository.saveMigrationData(deploymentId, auditInfo.migrationData)
    }

    if (entity.content) {
      await contentRepository.saveContentFiles({ deploymentId, entityId: entity.id }, entity.content)
    }

    return deploymentId
  }

  setEntitiesAsOverwritten(
    deploymentsRepository: DeploymentsRepository,
    overwritten: Set<DeploymentId>,
    overwrittenBy: EntityId
  ): Promise<void> {
    return deploymentsRepository.setEntitiesAsOverwritten(overwritten, overwrittenBy)
  }

  savePointerChanges(
    deploymentPointerChangesRepo: DeploymentPointerChangesRepository,
    deploymentId: DeploymentId,
    result: DeploymentResult
  ): Promise<void> {
    return deploymentPointerChangesRepo.savePointerChanges(deploymentId, result)
  }
}
