import { IPFSv2 } from '@dcl/schemas'
import {
  AuditInfo,
  ContentFileHash,
  EntityId,
  EntityType,
  Hashing,
  PartialDeploymentHistory,
  Pointer,
  ServerStatus
} from 'dcl-catalyst-commons'
import log4js from 'log4js'
import NodeCache from 'node-cache'
import { CURRENT_CONTENT_VERSION } from '../Environment'
import { metricsComponent } from '../metrics'
import { Database } from '../repository/Database'
import { Repository } from '../repository/Repository'
import { DB_REQUEST_PRIORITY } from '../repository/RepositoryQueue'
import { ContentItem } from '../storage/ContentStorage'
import { CacheByType } from './caching/Cache'
import {
  Deployment,
  DeploymentManager,
  DeploymentOptions,
  PartialDeploymentPointerChanges,
  PointerChangesFilters
} from './deployments/DeploymentManager'
import { Entity } from './Entity'
import { EntityFactory } from './EntityFactory'
import { FailedDeployment, FailedDeploymentsManager, FailureReason } from './errors/FailedDeploymentsManager'
import { PointerManager } from './pointers/PointerManager'
import {
  ClusterDeploymentsService,
  DeploymentContext,
  DeploymentFiles,
  DeploymentListener,
  DeploymentResult,
  InvalidResult,
  LocalDeploymentAuditInfo,
  MetaverseContentService
} from './Service'
import { ServiceStorage } from './ServiceStorage'
import { happenedBefore } from './time/TimeSorting'
import { Validator } from './validations/Validator'

export class ServiceImpl implements MetaverseContentService, ClusterDeploymentsService {
  private static readonly LOGGER = log4js.getLogger('ServiceImpl')
  private readonly listeners: DeploymentListener[] = []
  private readonly pointersBeingDeployed: Map<EntityType, Set<Pointer>> = new Map()
  private historySize: number = 0

  constructor(
    private readonly storage: ServiceStorage,
    private readonly pointerManager: PointerManager,
    private readonly failedDeploymentsManager: FailedDeploymentsManager,
    private readonly deploymentManager: DeploymentManager,
    private readonly validator: Validator,
    private readonly repository: Repository,
    private readonly cache: CacheByType<Pointer, Entity>,
    private readonly deploymentsCache: { cache: NodeCache; maxSize: number }
  ) {}

  async start(): Promise<void> {
    const amountOfDeployments = await this.repository.task((task) => task.deployments.getAmountOfDeployments(), {
      priority: DB_REQUEST_PRIORITY.HIGH
    })
    for (const [, amount] of amountOfDeployments) {
      this.historySize += amount
    }
  }

  async deployEntity(
    files: DeploymentFiles,
    entityId: EntityId,
    auditInfo: LocalDeploymentAuditInfo,
    context: DeploymentContext = DeploymentContext.LOCAL,
    task?: Database
  ): Promise<DeploymentResult> {
    // Hash all files
    const hashes: Map<ContentFileHash, Buffer> = await ServiceImpl.hashFiles(files, entityId)

    // Find entity file
    const entityFile = hashes.get(entityId)
    if (!entityFile) {
      return { errors: [`Failed to find the entity file.`] }
    }

    // Parse entity file into an Entity
    const entity: Entity = EntityFactory.fromBufferWithId(entityFile, entityId)

    // Validate that the entity's pointers are not currently being modified
    const pointersCurrentlyBeingDeployed = this.pointersBeingDeployed.get(entity.type) ?? new Set()
    const overlappingPointers = entity.pointers.filter((pointer) => pointersCurrentlyBeingDeployed.has(pointer))
    if (overlappingPointers.length > 0) {
      return {
        errors: [
          `The following pointers are currently being deployed: '${overlappingPointers.join()}'. Please try again in a few seconds.`
        ]
      }
    }

    // Update the current list of pointers being deployed
    entity.pointers.forEach((pointer) => pointersCurrentlyBeingDeployed.add(pointer))
    this.pointersBeingDeployed.set(entity.type, pointersCurrentlyBeingDeployed)

    // Check for if content is already stored
    const alreadyStoredContent: Map<ContentFileHash, boolean> = await this.isContentAvailable(
      Array.from(entity.content?.values() ?? [])
    )
    try {
      const storeResult:
        | { auditInfoComplete: AuditInfo; wasEntityDeployed: boolean; affectedPointers: Pointer[] | undefined }
        | InvalidResult = await this.repository.reuseTaskIfPresent(
        task,
        (db) => this.storeDeploymentInDatabase(db, entityId, entity, auditInfo, hashes, context, alreadyStoredContent),
        { priority: DB_REQUEST_PRIORITY.LOW }
      )

      if (!('auditInfoComplete' in storeResult)) {
        return storeResult
      } else if (storeResult.wasEntityDeployed) {
        // Report deployment to listeners
        await Promise.all(
          this.listeners.map((listener) => listener({ entity, auditInfo: storeResult.auditInfoComplete }))
        )

        // Since we are still reporting the history size, add one to it
        this.historySize++
        metricsComponent.increment('total_deployments_count', { entity_type: entity.type }, 1)

        // Invalidate cache for retrieving entities by id
        storeResult.affectedPointers?.forEach((pointer) => this.cache.invalidate(entity.type, pointer))

        // Insert in deployments cache the updated entities
        if (entity.type == EntityType.PROFILE) {
          // Currently we are only checking profile deployments, in the future this may be refactored
          entity.pointers.forEach((address) => {
            this.deploymentsCache.cache.set(address, storeResult.auditInfoComplete.localTimestamp)
          })
        }
      }
      return storeResult.auditInfoComplete.localTimestamp
    } catch (error) {
      throw error
    } finally {
      // Remove the updated pointer from the list of current being deployed
      const pointersCurrentlyBeingDeployed = this.pointersBeingDeployed.get(entity.type)!
      entity.pointers.forEach((pointer) => pointersCurrentlyBeingDeployed.delete(pointer))
    }
  }

  private async storeDeploymentInDatabase(
    task: Database,
    entityId: string,
    entity: Entity,
    auditInfo: LocalDeploymentAuditInfo,
    hashes: Map<string, Buffer>,
    context: DeploymentContext,
    alreadyStoredContent: Map<string, boolean>
  ): Promise<
    | InvalidResult
    | { auditInfoComplete: AuditInfo; wasEntityDeployed: boolean; affectedPointers: Pointer[] | undefined }
  > {
    const isEntityAlreadyDeployed = await this.isEntityAlreadyDeployed(task, entityId)

    // Prepare validation functions that need context
    const validationResult = await this.validator.validate({ entity, auditInfo, files: hashes }, context, {
      fetchDeployments: (filters) => this.getDeployments(task, { filters }),
      areThereNewerEntities: (entity) => this.areThereNewerEntitiesOnPointers(task, entity),
      fetchDeploymentStatus: (type, id) =>
        this.failedDeploymentsManager.getDeploymentStatus(task.failedDeployments, type, id),
      isContentStoredAlready: () => Promise.resolve(alreadyStoredContent),
      isEntityDeployedAlready: (entityIdToCheck: EntityId) =>
        Promise.resolve(isEntityAlreadyDeployed && entityId === entityIdToCheck),
      isEntityRateLimited: (entity) => Promise.resolve(this.isEntityRateLimited(entity)),
      fetchContentFileSize: async (hash) => await this.getSize(hash)
    })

    if (!validationResult.ok) {
      return { errors: validationResult.errors }
    }

    const auditInfoComplete: AuditInfo = {
      ...auditInfo,
      version: entity.version,
      localTimestamp: Date.now()
    }

    let affectedPointers: Pointer[] | undefined

    if (!isEntityAlreadyDeployed) {
      // IF THIS POINT WAS REACHED, THEN THE DEPLOYMENT WILL BE COMMITTED
      // Calculate overwrites
      const { overwrote, overwrittenBy } = await this.pointerManager.calculateOverwrites(task.pointerHistory, entity)

      // Store the deployment
      const deploymentId = await this.deploymentManager.saveDeployment(
        task.deployments,
        task.migrationData,
        task.content,
        entity,
        auditInfoComplete,
        overwrittenBy
      )

      // Modify active pointers
      const pointersFromEntity = await this.pointerManager.referenceEntityFromPointers(
        task.lastDeployedPointers,
        deploymentId,
        entity
      )
      affectedPointers = Array.from(pointersFromEntity.keys())

      // Save deployment pointer changes
      await this.deploymentManager.savePointerChanges(task.deploymentPointerChanges, deploymentId, pointersFromEntity)

      // Add to pointer history
      await this.pointerManager.addToHistory(task.pointerHistory, deploymentId, entity)

      // Set who overwrote who
      await this.deploymentManager.setEntitiesAsOverwritten(task.deployments, overwrote, deploymentId)

      // Store the entity's content
      await this.storeEntityContent(hashes, alreadyStoredContent)
    }

    // Mark deployment as successful (this does nothing it if hadn't failed on the first place)
    await this.failedDeploymentsManager.reportSuccessfulDeployment(task.failedDeployments, entity.type, entity.id)

    return { auditInfoComplete, wasEntityDeployed: !isEntityAlreadyDeployed, affectedPointers }
  }

  reportErrorDuringSync(
    entityType: EntityType,
    entityId: EntityId,
    reason: FailureReason,
    errorDescription?: string
  ): Promise<null> {
    ServiceImpl.LOGGER.warn(`Deployment of entity (${entityType}, ${entityId}) failed. Reason was: '${reason}'`)
    return this.repository.run(
      (db) =>
        this.failedDeploymentsManager.reportFailure(
          db.failedDeployments,
          entityType,
          entityId,
          reason,
          errorDescription
        ),
      { priority: DB_REQUEST_PRIORITY.HIGH }
    )
  }

  async getEntitiesByIds(ids: EntityId[], task: Database): Promise<Entity[]> {
    const deployments = await this.getDeployments(task, { filters: { entityIds: ids } })
    return this.mapDeploymentsToEntities(deployments)
  }

  async getEntitiesByPointers(type: EntityType, pointers: Pointer[], task: Database): Promise<Entity[]> {
    const allEntities = await this.cache.get(type, pointers, async (type, pointers) => {
      const deployments = await this.getDeployments(task, {
        filters: { entityTypes: [type], pointers, onlyCurrentlyPointed: true }
      })
      const entities = this.mapDeploymentsToEntities(deployments)
      const entries: [Pointer, Entity][][] = entities.map((entity) =>
        entity.pointers.map((pointer) => [pointer, entity])
      )

      const pointersMap = new Map<Pointer, Entity | undefined>(entries.flat())

      // Get Deployments only retrieves the active entities, so if a pointer has a null value we need to manually define it
      for (const pointer of pointers) {
        if (!pointersMap.has(pointer)) pointersMap.set(pointer, undefined)
      }
      return pointersMap
    })

    // Since the same entity might appear many times, we must remove duplicates
    const grouped = new Map(allEntities.map((entity) => [entity.id, entity]))
    return Array.from(grouped.values())
  }

  private mapDeploymentsToEntities(history: PartialDeploymentHistory<Deployment>): Entity[] {
    return history.deployments.map(
      ({ entityVersion, entityId, entityType, pointers, entityTimestamp, content, metadata }) => ({
        version: entityVersion,
        id: entityId,
        type: entityType,
        pointers,
        timestamp: entityTimestamp,
        content,
        metadata
      })
    )
  }

  /** Check if there are newer entities on the given entity's pointers */
  private async areThereNewerEntitiesOnPointers(task: Database, entity: Entity): Promise<boolean> {
    // Validate that pointers aren't referring to an entity with a higher timestamp
    const { deployments: lastDeployments } = await this.getDeployments(task, {
      filters: { entityTypes: [entity.type], pointers: entity.pointers }
    })
    for (const lastDeployment of lastDeployments) {
      if (happenedBefore(entity, lastDeployment)) {
        return true
      }
    }
    return false
  }

  /** Check if the entity should be rate limit: no deployment has been made for the same pointer in the last ttl
   * and no more than max size of deployments were made either   */
  private isEntityRateLimited(entity: Entity): boolean {
    // Currently only for profiles
    if (entity.type != EntityType.PROFILE) {
      return false
    }
    return (
      entity.pointers.some((p) => !!this.deploymentsCache.cache.get(p)) ||
      this.deploymentsCache.cache.stats.keys > this.deploymentsCache.maxSize
    )
  }

  private storeEntityContent(
    hashes: Map<ContentFileHash, Buffer>,
    alreadyStoredHashes: Map<ContentFileHash, boolean>
  ): Promise<any> {
    // If entity was committed, then store all it's content (that isn't already stored)
    const contentStorageActions: Promise<void>[] = Array.from(hashes.entries())
      .filter(([fileHash]) => !alreadyStoredHashes.get(fileHash))
      .map(([fileHash, file]) => this.storage.storeContent(fileHash, file))

    return Promise.all(contentStorageActions)
  }

  /**
   * This function will take some deployment files and hash them. They might come already hashed, and if that is the case we will just return them.
   * They could come hashed because the denylist decorator might have already hashed them for its own validations. In order to avoid re-hashing
   * them in the service (because there might be hundreds of files), we will send the hash result.
   */
  static async hashFiles(files: DeploymentFiles, entityId: EntityId): Promise<Map<ContentFileHash, Buffer>> {
    if (files instanceof Map) {
      return files
    } else {
      const hashEntries: { hash: ContentFileHash; file: Buffer }[] = this.isIPFSHash(entityId)
        ? await Hashing.calculateIPFSHashes(files)
        : await Hashing.calculateHashes(files)
      return new Map(hashEntries.map(({ hash, file }) => [hash, file]))
    }
  }

  static isIPFSHash(hash: string): boolean {
    return IPFSv2.validate(hash)
  }

  getSize(fileHash: ContentFileHash): Promise<number | undefined> {
    return this.storage.getSize(fileHash)
  }

  getContent(fileHash: ContentFileHash): Promise<ContentItem | undefined> {
    return this.storage.getContent(fileHash)
  }

  isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>> {
    return this.storage.isContentAvailable(fileHashes)
  }

  getStatus(): ServerStatus {
    return {
      name: '', // TODO: Remove and communicate breaking change accordingly
      version: CURRENT_CONTENT_VERSION,
      currentTime: Date.now(),
      lastImmutableTime: 0,
      historySize: this.historySize
    }
  }

  deleteContent(fileHashes: ContentFileHash[]): Promise<void> {
    return this.storage.deleteContent(fileHashes)
  }

  storeContent(fileHash: ContentFileHash, content: Buffer): Promise<void> {
    return this.storage.storeContent(fileHash, content)
  }

  areEntitiesAlreadyDeployed(entityIds: EntityId[], task?: Database): Promise<Map<EntityId, boolean>> {
    return this.repository.reuseTaskIfPresent(
      task,
      (db) => this.deploymentManager.areEntitiesDeployed(db.deployments, entityIds),
      {
        priority: DB_REQUEST_PRIORITY.HIGH
      }
    )
  }

  getDeployments(task?: Database, options?: DeploymentOptions): Promise<PartialDeploymentHistory<Deployment>> {
    return this.repository.reuseTaskIfPresent(
      task,
      (db) => this.deploymentManager.getDeployments(db.deployments, db.content, db.migrationData, options),
      {
        priority: DB_REQUEST_PRIORITY.LOW
      }
    )
  }

  // This endpoint is for debugging purposes
  getActiveDeploymentsByContentHash(hash: string): Promise<EntityId[]> {
    return this.repository.task(
      (db) => db.taskIf((task) => this.deploymentManager.getActiveDeploymentsByContentHash(task.deployments, hash)),
      {
        priority: DB_REQUEST_PRIORITY.LOW
      }
    )
  }

  // This endpoint is not currently used for the sync
  getPointerChanges(
    filters?: PointerChangesFilters,
    offset?: number,
    limit?: number,
    lastId?: string,
    task?: Database
  ): Promise<PartialDeploymentPointerChanges> {
    return this.repository.reuseIfPresent(
      task,
      (db) =>
        db.taskIf((task) =>
          this.deploymentManager.getPointerChanges(
            task.deploymentPointerChanges,
            task.deployments,
            filters,
            offset,
            limit,
            lastId
          )
        ),
      {
        priority: DB_REQUEST_PRIORITY.LOW
      }
    )
  }

  getAllFailedDeployments(): Promise<FailedDeployment[]> {
    return this.repository.run((db) => this.failedDeploymentsManager.getAllFailedDeployments(db.failedDeployments), {
      priority: DB_REQUEST_PRIORITY.LOW
    })
  }

  listenToDeployments(listener: DeploymentListener): void {
    this.listeners.push(listener)
  }

  private async isEntityAlreadyDeployed(task: Database, entityId: EntityId): Promise<boolean> {
    const result = await this.areEntitiesAlreadyDeployed([entityId], task)
    return result.get(entityId)!
  }
}
