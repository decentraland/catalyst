import { IPFSv2 } from '@dcl/schemas'
import { ILoggerComponent } from '@well-known-components/interfaces'
import {
  AuditInfo,
  ContentFileHash,
  Deployment,
  Entity,
  EntityId,
  EntityType,
  Hashing,
  PartialDeploymentHistory,
  Pointer
} from 'dcl-catalyst-commons'
import { AuthChain, Authenticator } from 'dcl-crypto'
import NodeCache from 'node-cache'
import { Readable } from 'stream'
import { Database } from '../repository/Database'
import { DB_REQUEST_PRIORITY } from '../repository/RepositoryQueue'
import { ContentItem } from '../storage/ContentStorage'
import { AppComponents } from '../types'
import { CacheByType } from './caching/Cache'
import { DeploymentOptions } from './deployments/types'
import { EntityFactory } from './EntityFactory'
import { FailedDeployment, FailureReason } from './errors/FailedDeploymentsManager'
import {
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

export class ServiceImpl implements MetaverseContentService {
  private static LOGGER: ILoggerComponent.ILogger
  private readonly listeners: DeploymentListener[] = []
  private readonly pointersBeingDeployed: Map<EntityType, Set<Pointer>> = new Map()
  // TODO (menduz): I'd remove this serviceStorage class
  private serviceStorage: ServiceStorage

  private readonly LEGACY_CONTENT_MIGRATION_TIMESTAMP: Date = new Date(1582167600000) // DCL Launch Day

  constructor(
    public components: Pick<
      AppComponents,
      | 'metrics'
      | 'storage'
      | 'pointerManager'
      | 'failedDeploymentsManager'
      | 'deploymentManager'
      | 'validator'
      | 'repository'
      | 'logs'
      | 'authenticator'
    >,
    private readonly cache: CacheByType<Pointer, Entity>,
    private readonly deploymentsCache: { cache: NodeCache; maxSize: number }
  ) {
    this.serviceStorage = new ServiceStorage(components.storage)
    ServiceImpl.LOGGER = components.logs.getLogger('ServiceImpl')
  }

  async start(): Promise<void> {}

  async deployEntity(
    files: DeploymentFiles,
    entityId: EntityId,
    auditInfo: LocalDeploymentAuditInfo,
    context: DeploymentContext,
    task?: Database
  ): Promise<DeploymentResult> {
    // Hash all files
    const hashes: Map<ContentFileHash, Uint8Array> = await ServiceImpl.hashFiles(files, entityId)

    // Find entity file
    const entityFile = hashes.get(entityId)
    if (!entityFile) {
      return { errors: [`Failed to find the entity file.`] }
    }

    // Parse entity file into an Entity
    let entity: Entity
    try {
      entity = EntityFactory.fromBufferWithId(entityFile, entityId)
      if (!entity) {
        return { errors: ['There was a problem parsing the entity, it was null'] }
      }
    } catch (error) {
      ServiceImpl.LOGGER.error(`There was an error parsing the entity: ${error}`)
      return { errors: ['There was a problem parsing the entity'] }
    }

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
    if (!entity.pointers)
      return {
        errors: [`The entity does not have any pointer.`]
      }

    entity.pointers.forEach((pointer) => pointersCurrentlyBeingDeployed.add(pointer))
    this.pointersBeingDeployed.set(entity.type, pointersCurrentlyBeingDeployed)

    // Check for if content is already stored
    const alreadyStoredContent: Map<ContentFileHash, boolean> = await this.isContentAvailable(
      entity.content?.map((contentFile) => contentFile.hash) ?? []
    )

    const contextToDeploy: DeploymentContext = this.calculateIfLegacy(entity, auditInfo.authChain, context)

    try {
      const storeResult:
        | { auditInfoComplete: AuditInfo; wasEntityDeployed: boolean; affectedPointers: Pointer[] | undefined }
        | InvalidResult = await this.storeDeploymentInDatabase(
        task,
        entityId,
        entity,
        auditInfo,
        hashes,
        contextToDeploy,
        alreadyStoredContent
      )

      if (!('auditInfoComplete' in storeResult)) {
        return storeResult
      } else if (storeResult.wasEntityDeployed) {
        // Report deployment to listeners
        await Promise.all(
          this.listeners.map((listener) => listener({ entity, auditInfo: storeResult.auditInfoComplete }))
        )

        this.components.metrics.increment('total_deployments_count', { entity_type: entity.type }, 1)

        // Invalidate cache for retrieving entities by id
        storeResult.affectedPointers?.forEach((pointer) => this.cache.invalidate(entity.type, pointer))

        // Insert in deployments cache the updated entities
        if (entity.type == EntityType.PROFILE) {
          // Currently we are only checking profile deployments, in the future this may be refactored
          entity.pointers.forEach((pointer) => {
            this.deploymentsCache.cache.set(pointer, storeResult.auditInfoComplete.localTimestamp)
          })
        }
      }
      return storeResult.auditInfoComplete.localTimestamp
    } finally {
      // Remove the updated pointer from the list of current being deployed
      const pointersCurrentlyBeingDeployed = this.pointersBeingDeployed.get(entity.type)!
      entity.pointers.forEach((pointer) => pointersCurrentlyBeingDeployed.delete(pointer))
    }
  }

  private calculateIfLegacy(entity: Entity, authChain: AuthChain, context: DeploymentContext): DeploymentContext {
    if (this.isLegacyEntityV2(entity, authChain, context)) {
      return DeploymentContext.SYNCED_LEGACY_ENTITY
    }
    return context
  }

  // Legacy v2 content entities are only supported when syncing or fix attempt
  private isLegacyEntityV2(entity: Entity, authChain: AuthChain, context: DeploymentContext): boolean {
    return (
      (context === DeploymentContext.FIX_ATTEMPT || context === DeploymentContext.SYNCED) &&
      new Date(entity.timestamp) < this.LEGACY_CONTENT_MIGRATION_TIMESTAMP &&
      this.components.authenticator.isAddressOwnedByDecentraland(Authenticator.ownerAddress(authChain))
    )
  }

  private async storeDeploymentInDatabase(
    task: Database | undefined,
    entityId: string,
    entity: Entity,
    auditInfo: LocalDeploymentAuditInfo,
    hashes: Map<string, Uint8Array>,
    context: DeploymentContext,
    alreadyStoredContent: Map<string, boolean>
  ): Promise<
    | InvalidResult
    | { auditInfoComplete: AuditInfo; wasEntityDeployed: boolean; affectedPointers: Pointer[] | undefined }
  > {
    return await this.components.repository.reuseIfPresent(
      task,
      (db) =>
        db.txIf(async (transaction) => {
          const deployedEntity = await this.getEntityById(entityId, transaction)
          const isEntityAlreadyDeployed = !!deployedEntity

          // Prepare validation functions that need context
          const validationResult = await this.components.validator.validate(
            { entity, auditInfo, files: hashes },
            context,
            {
              areThereNewerEntities: (entity) => this.areThereNewerEntitiesOnPointers(entity, transaction),
              fetchDeploymentStatus: (type, id) =>
                this.components.failedDeploymentsManager.getDeploymentStatus(type, id),
              isContentStoredAlready: () => Promise.resolve(alreadyStoredContent),
              isEntityDeployedAlready: (): Promise<boolean> => Promise.resolve(isEntityAlreadyDeployed),
              isEntityRateLimited: (entity) => Promise.resolve(this.isEntityRateLimited(entity)),
              fetchContentFileSize: async (hash) => await this.getSize(hash)
            }
          )

          if (!validationResult.ok) {
            ServiceImpl.LOGGER.warn(`Validations for deployment failed`, {
              entityId,
              errors: validationResult.errors.join(',')
            })
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
            const { overwrote, overwrittenBy } = await this.components.pointerManager.calculateOverwrites(
              transaction.pointerHistory,
              entity
            )

            // Store the deployment
            const deploymentId = await this.components.deploymentManager.saveDeployment(
              transaction.deployments,
              transaction.migrationData,
              transaction.content,
              entity,
              auditInfoComplete,
              overwrittenBy
            )

            // Modify active pointers
            const pointersFromEntity = await this.components.pointerManager.referenceEntityFromPointers(
              transaction.lastDeployedPointers,
              deploymentId,
              entity
            )
            affectedPointers = Array.from(pointersFromEntity.keys())

            // Save deployment pointer changes
            await this.components.deploymentManager.savePointerChanges(
              transaction.deploymentPointerChanges,
              deploymentId,
              pointersFromEntity
            )

            // Add to pointer history
            await this.components.pointerManager.addToHistory(transaction.pointerHistory, deploymentId, entity)

            // Set who overwrote who
            await this.components.deploymentManager.setEntitiesAsOverwritten(
              transaction.deployments,
              overwrote,
              deploymentId
            )

            // Store the entity's content
            await this.storeEntityContent(hashes, alreadyStoredContent)
          } else {
            ServiceImpl.LOGGER.info(`Entity already deployed`, { entityId })
            auditInfoComplete.localTimestamp = deployedEntity.localTimestamp
          }

          // Mark deployment as successful (this does nothing it if hadn't failed on the first place)
          await this.components.failedDeploymentsManager.reportSuccessfulDeployment(entity.type, entity.id)

          return { auditInfoComplete, wasEntityDeployed: !isEntityAlreadyDeployed, affectedPointers }
        }),
      { priority: DB_REQUEST_PRIORITY.HIGH }
    )
  }

  reportErrorDuringSync(
    entityType: EntityType,
    entityId: EntityId,
    reason: FailureReason,
    authChain: AuthChain,
    errorDescription?: string
  ): void {
    ServiceImpl.LOGGER.warn(
      `Deployment of entity (${entityType}, ${entityId}) failed. Reason was: '${errorDescription}'`
    )
    return this.components.failedDeploymentsManager.reportFailure(
      entityType,
      entityId,
      reason,
      authChain,
      errorDescription
    )
  }

  async getEntitiesByIds(ids: EntityId[], task?: Database): Promise<Entity[]> {
    const deployments = await this.getDeployments({ filters: { entityIds: ids } }, task)
    return this.mapDeploymentsToEntities(deployments)
  }

  async getEntitiesByPointers(type: EntityType, pointers: Pointer[], task?: Database): Promise<Entity[]> {
    const allEntities = await this.cache.get(type, pointers, async (type, pointers) => {
      const deployments = await this.getDeployments(
        { filters: { entityTypes: [type], pointers, onlyCurrentlyPointed: true } },
        task
      )
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
        content: content?.map(({ key, hash }) => ({ file: key, hash })),
        metadata
      })
    )
  }

  /** Check if there are newer entities on the given entity's pointers */
  private async areThereNewerEntitiesOnPointers(entity: Entity, transaction: Database): Promise<boolean> {
    // Validate that pointers aren't referring to an entity with a higher timestamp
    const { deployments: lastDeployments } = await this.getDeployments(
      { filters: { entityTypes: [entity.type], pointers: entity.pointers } },
      transaction
    )
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
    hashes: Map<ContentFileHash, Uint8Array>,
    alreadyStoredHashes: Map<ContentFileHash, boolean>
  ): Promise<any> {
    // If entity was committed, then store all it's content (that isn't already stored)
    const contentStorageActions: Promise<void>[] = Array.from(hashes.entries())
      .filter(([fileHash]) => !alreadyStoredHashes.get(fileHash))
      .map(([fileHash, file]) => this.serviceStorage.storeContent(fileHash, file))

    return Promise.all(contentStorageActions)
  }

  /**
   * This function will take some deployment files and hash them. They might come already hashed, and if that is the case we will just return them.
   * They could come hashed because the denylist decorator might have already hashed them for its own validations. In order to avoid re-hashing
   * them in the service (because there might be hundreds of files), we will send the hash result.
   */
  static async hashFiles(files: DeploymentFiles, entityId: EntityId): Promise<Map<ContentFileHash, Uint8Array>> {
    if (files instanceof Map) {
      return files
    } else {
      const hashEntries = this.isIPFSHash(entityId)
        ? await Hashing.calculateIPFSHashes(files)
        : await Hashing.calculateHashes(files)
      return new Map(hashEntries.map(({ hash, file }) => [hash, file]))
    }
  }

  static isIPFSHash(hash: string): boolean {
    return IPFSv2.validate(hash)
  }

  getSize(fileHash: ContentFileHash): Promise<number | undefined> {
    return this.serviceStorage.getSize(fileHash)
  }

  getContent(fileHash: ContentFileHash): Promise<ContentItem | undefined> {
    return this.serviceStorage.getContent(fileHash)
  }

  isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>> {
    return this.serviceStorage.isContentAvailable(fileHashes)
  }

  deleteContent(fileHashes: ContentFileHash[]): Promise<void> {
    return this.serviceStorage.deleteContent(fileHashes)
  }

  storeContent(fileHash: ContentFileHash, content: Buffer | Readable): Promise<void> {
    return this.serviceStorage.storeContent(fileHash, content)
  }

  getEntityById(entityId: EntityId, task?: Database): Promise<{ entityId: EntityId; localTimestamp: number } | void> {
    return this.components.repository.reuseIfPresent(
      task,
      (db) => this.components.deploymentManager.getEntityById(db.deployments, entityId),
      {
        priority: DB_REQUEST_PRIORITY.HIGH
      }
    )
  }

  getDeployments(options?: DeploymentOptions, task?: Database): Promise<PartialDeploymentHistory<Deployment>> {
    return this.components.repository.reuseIfPresent(
      task,
      (db) =>
        db.taskIf((task) =>
          this.components.deploymentManager.getDeployments(task.deployments, task.content, task.migrationData, options)
        ),
      {
        priority: DB_REQUEST_PRIORITY.HIGH
      }
    )
  }

  // This endpoint is for debugging purposes
  getActiveDeploymentsByContentHash(hash: string, task?: Database): Promise<EntityId[]> {
    return this.components.repository.reuseIfPresent(
      task,
      (db) =>
        db.taskIf((task) =>
          this.components.deploymentManager.getActiveDeploymentsByContentHash(task.deployments, hash)
        ),
      {
        priority: DB_REQUEST_PRIORITY.LOW
      }
    )
  }

  getAllFailedDeployments(): FailedDeployment[] {
    return this.components.failedDeploymentsManager.getAllFailedDeployments()
  }

  listenToDeployments(listener: DeploymentListener): void {
    this.listeners.push(listener)
  }
}
