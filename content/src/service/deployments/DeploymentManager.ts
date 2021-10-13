import {
  AuditInfo,
  ContentFileHash,
  Deployment as ControllerDeployment,
  DeploymentFilters,
  DeploymentSorting,
  EntityId,
  EntityType,
  PartialDeploymentHistory,
  Pointer,
  SortingField,
  Timestamp
} from 'dcl-catalyst-commons'
import { DeploymentField } from '../../controller/Controller'
import { ContentFilesRepository } from '../../repository/extensions/ContentFilesRepository'
import { DeploymentPointerChangesRepository } from '../../repository/extensions/DeploymentPointerChangesRepository'
import { DeploymentId, DeploymentsRepository } from '../../repository/extensions/DeploymentsRepository'
import { MigrationDataRepository } from '../../repository/extensions/MigrationDataRepository'
import { Entity } from '../../service/Entity'
import { DELTA_POINTER_RESULT, DeploymentResult } from '../pointers/PointerManager'

export class DeploymentManager {
  private static MAX_HISTORY_LIMIT = 500

  areEntitiesDeployed(
    deploymentRepository: DeploymentsRepository,
    entityIds: EntityId[]
  ): Promise<Map<EntityId, boolean>> {
    return deploymentRepository.areEntitiesDeployed(entityIds)
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
  ) {
    return deploymentsRepository.setEntitiesAsOverwritten(overwritten, overwrittenBy)
  }

  async getPointerChanges(
    deploymentPointerChangesRepo: DeploymentPointerChangesRepository,
    deploymentsRepo: DeploymentsRepository,
    filters?: PointerChangesFilters,
    offset?: number,
    limit?: number,
    lastId?: string
  ): Promise<PartialDeploymentPointerChanges> {
    const curatedOffset = offset && offset >= 0 ? offset : 0
    const curatedLimit =
      limit && limit > 0 && limit <= DeploymentManager.MAX_HISTORY_LIMIT ? limit : DeploymentManager.MAX_HISTORY_LIMIT
    const deploymentsWithExtra = await deploymentsRepo.getHistoricalDeployments(
      curatedOffset,
      curatedLimit + 1,
      filters,
      { field: SortingField.LOCAL_TIMESTAMP },
      lastId
    )
    const moreData = deploymentsWithExtra.length > curatedLimit

    const deployments = deploymentsWithExtra.slice(0, curatedLimit)
    const deploymentIds = deployments.map(({ deploymentId }) => deploymentId)
    const deltasForDeployments = await deploymentPointerChangesRepo.getPointerChangesForDeployments(deploymentIds)
    const pointerChanges: DeploymentPointerChanges[] = deployments.map(
      ({ deploymentId, entityId, entityType, localTimestamp }) => {
        const delta = deltasForDeployments.get(deploymentId) ?? new Map()
        const changes = this.transformPointerChanges(entityId, delta)
        return { entityType, entityId, localTimestamp, changes }
      }
    )

    return {
      pointerChanges,
      filters: {
        ...filters
      },
      pagination: {
        offset: curatedOffset,
        limit: curatedLimit,
        moreData
      }
    }
  }

  savePointerChanges(
    deploymentPointerChangesRepo: DeploymentPointerChangesRepository,
    deploymentId: DeploymentId,
    result: DeploymentResult
  ) {
    return deploymentPointerChangesRepo.savePointerChanges(deploymentId, result)
  }

  private transformPointerChanges(
    deployedEntity: EntityId,
    input: Map<Pointer, { before: EntityId | undefined; after: DELTA_POINTER_RESULT }>
  ): PointerChanges {
    const newEntries = Array.from(input.entries()).map<
      [Pointer, { before: EntityId | undefined; after: EntityId | undefined }]
    >(([pointer, { before, after }]) => [
      pointer,
      { before, after: after === DELTA_POINTER_RESULT.SET ? deployedEntity : undefined }
    ])
    return new Map(newEntries)
  }
}

export type Deployment = Omit<ControllerDeployment, 'content'> & { content?: Map<string, ContentFileHash> }

export type DeploymentPointerChanges = {
  entityType: EntityType
  entityId: EntityId
  localTimestamp: Timestamp
  changes: PointerChanges
}

export type PartialDeploymentPointerChanges = {
  pointerChanges: DeploymentPointerChanges[]
  filters: Omit<PointerChangesFilters, 'entityType'>
  pagination: {
    offset: number
    limit: number
    moreData: boolean
    lastId?: string
    next?: string
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

export type PointerChangesFilters = Pick<DeploymentFilters, 'from' | 'to' | 'entityTypes'>

export type PointerChanges = Map<Pointer, { before: EntityId | undefined; after: EntityId | undefined }>
