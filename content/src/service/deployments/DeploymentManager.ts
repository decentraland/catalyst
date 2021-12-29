import {
  AuditInfo,
  Deployment,
  DeploymentFilters,
  DeploymentSorting,
  Entity,
  EntityId,
  PartialDeploymentHistory
} from 'dcl-catalyst-commons'
import { DeploymentField } from '../../controller/Controller'
import { ContentFilesRepository } from '../../repository/extensions/ContentFilesRepository'
import { DeploymentPointerChangesRepository } from '../../repository/extensions/DeploymentPointerChangesRepository'
import { DeploymentId, DeploymentsRepository } from '../../repository/extensions/DeploymentsRepository'
import { MigrationDataRepository } from '../../repository/extensions/MigrationDataRepository'
import { DeploymentResult } from '../pointers/PointerManager'

export class DeploymentManager {
  private static MAX_HISTORY_LIMIT = 500

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

  async getDeployments(
    deploymentsRepository: DeploymentsRepository,
    contentFilesRepository: ContentFilesRepository,
    migrationDataRepository: MigrationDataRepository,
    options?: DeploymentOptions
  ): Promise<PartialDeploymentHistory<Deployment>> {
    const curatedOffset = options?.offset && options.offset >= 0 ? options.offset : 0
    const curatedLimit =
      options?.limit && options.limit > 0 && options.limit <= DeploymentManager.MAX_HISTORY_LIMIT
        ? options.limit
        : DeploymentManager.MAX_HISTORY_LIMIT

    const deploymentsWithExtra = await deploymentsRepository.getHistoricalDeployments(
      curatedOffset,
      curatedLimit + 1,
      options?.filters,
      options?.sortBy,
      options?.lastId
    )

    const moreData = deploymentsWithExtra.length > curatedLimit

    const deploymentsResult = deploymentsWithExtra.slice(0, curatedLimit)
    const deploymentIds = deploymentsResult.map(({ deploymentId }) => deploymentId)
    const content = await contentFilesRepository.getContentFiles(deploymentIds)

    // TODO [new-sync]: migrationData nolonger required
    const migrationData = await migrationDataRepository.getMigrationData(deploymentIds)

    const deployments: Deployment[] = deploymentsResult.map((result) => ({
      entityVersion: result.version,
      entityType: result.entityType,
      entityId: result.entityId,
      pointers: result.pointers,
      entityTimestamp: result.entityTimestamp,
      content: content.get(result.deploymentId),
      metadata: result.metadata,
      deployedBy: result.deployerAddress,
      auditInfo: {
        version: result.version,
        authChain: result.authChain,
        localTimestamp: result.localTimestamp,
        overwrittenBy: result.overwrittenBy,
        migrationData: migrationData.get(result.deploymentId)
      }
    }))

    return {
      deployments: deployments,
      filters: {
        ...options?.filters
      },
      pagination: {
        offset: curatedOffset,
        limit: curatedLimit,
        moreData: moreData,
        lastId: options?.lastId
      }
    }
  }

  async getActiveDeploymentsByContentHash(
    deploymentsRepository: DeploymentsRepository,
    hash: string
  ): Promise<EntityId[]> {
    return deploymentsRepository.getActiveDeploymentsByContentHash(hash)
  }

  async saveDeployment(
    deploymentsRepository: DeploymentsRepository,
    migrationDataRepository: MigrationDataRepository,
    contentRepository: ContentFilesRepository,
    entity: Entity,
    auditInfo: AuditInfo,
    overwrittenBy: DeploymentId | null
  ): Promise<DeploymentId> {
    const deploymentId = await deploymentsRepository.saveDeployment(entity, auditInfo, overwrittenBy)
    if (auditInfo.migrationData) {
      await migrationDataRepository.saveMigrationData(deploymentId, auditInfo.migrationData)
    }

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

  savePointerChanges(
    deploymentPointerChangesRepo: DeploymentPointerChangesRepository,
    deploymentId: DeploymentId,
    result: DeploymentResult
  ): Promise<void> {
    return deploymentPointerChangesRepo.savePointerChanges(deploymentId, result)
  }
}

export type DeploymentOptions = {
  fields?: DeploymentField[]
  filters?: DeploymentFilters
  sortBy?: DeploymentSorting
  offset?: number
  limit?: number
  lastId?: string
}
