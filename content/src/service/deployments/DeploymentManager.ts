import { Entity } from '@katalyst/content/service/Entity'
import { ContentFilesRepository } from '@katalyst/content/storage/repositories/ContentFilesRepository'
import { DeploymentPointerChangesRepository } from '@katalyst/content/storage/repositories/DeploymentPointerChangesRepository'
import { DeploymentId, DeploymentsRepository } from '@katalyst/content/storage/repositories/DeploymentsRepository'
import { MigrationDataRepository } from '@katalyst/content/storage/repositories/MigrationDataRepository'
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

    const curatedFilters = Object.assign({}, options?.filters)

    if (!options?.sortBy?.field || options?.sortBy?.field != SortingField.ENTITY_TIMESTAMP) {
      curatedFilters.from = curatedFilters.fromLocalTimestamp
      curatedFilters.to = curatedFilters.toLocalTimestamp
    }
    curatedFilters.fromLocalTimestamp = undefined
    curatedFilters.toLocalTimestamp = undefined

    const deploymentsWithExtra = await deploymentsRepository.getHistoricalDeployments(
      curatedOffset,
      curatedLimit + 1,
      curatedFilters,
      options?.sortBy,
      options?.lastId
    )

    const moreData = deploymentsWithExtra.length > curatedLimit

    const deploymentsResult = deploymentsWithExtra.slice(0, curatedLimit)
    const deploymentIds = deploymentsResult.map(({ deploymentId }) => deploymentId)
    const content = await contentFilesRepository.getContentFiles(deploymentIds)
    const migrationData = await migrationDataRepository.getMigrationData(deploymentIds)

    const deployments: Deployment[] = deploymentsResult.map((result) => ({
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
        originServerUrl: result.originServerUrl,
        originTimestamp: result.originTimestamp,
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
  filters?: DeploymentFilters
  sortBy?: DeploymentSorting
  offset?: number
  limit?: number
  lastId?: string
}

export type PointerChangesFilters = Pick<
  DeploymentFilters,
  'from' | 'to' | 'fromLocalTimestamp' | 'toLocalTimestamp' | 'entityTypes'
>

export type PointerChanges = Map<Pointer, { before: EntityId | undefined; after: EntityId | undefined }>
