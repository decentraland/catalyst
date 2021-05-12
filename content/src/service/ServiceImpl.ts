import {
  AuditInfo,
  ContentFileHash,
  EntityId,
  EntityType,
  ENTITY_FILE_NAME,
  Hashing,
  PartialDeploymentHistory,
  Pointer,
  ServerName,
  ServerStatus
} from 'dcl-catalyst-commons'
import log4js from 'log4js'
import { TOTAL_AMOUNT_OF_DEPLOYMENTS } from '../ContentMetrics'
import { ContentFile } from '../controller/Controller'
import { CURRENT_CONTENT_VERSION } from '../Environment'
import { Database } from '../repository/Database'
import { Repository } from '../repository/Repository'
import { DB_REQUEST_PRIORITY } from '../repository/RepositoryQueue'
import { ContentItem, fromBuffer, StorageContent } from '../storage/ContentStorage'
import { ContentAuthenticator } from './auth/Authenticator'
import { CacheByType } from './caching/Cache'
import {
  Deployment,
  DeploymentManager,
  DeploymentOptions,
  EntityByHash,
  PartialDeploymentPointerChanges,
  PointerChangesFilters
} from './deployments/DeploymentManager'
import { Entity } from './Entity'
import { EntityFactory } from './EntityFactory'
import { FailedDeploymentsManager, FailureReason } from './errors/FailedDeploymentsManager'
import { PointerManager } from './pointers/PointerManager'
import {
  ClusterDeploymentsService,
  DeploymentListener,
  DeploymentResult,
  InvalidResult,
  LocalDeploymentAuditInfo,
  MetaverseContentService
} from './Service'
import { ServiceStorage } from './ServiceStorage'
import { IdentityProvider } from './synchronization/ContentCluster'
import { happenedBefore } from './time/TimeSorting'
import { ValidationContext } from './validations/ValidationContext'
import { Validations } from './validations/Validations'

export class ServiceImpl implements MetaverseContentService, ClusterDeploymentsService {
  private static readonly LOGGER = log4js.getLogger('ServiceImpl')
  private static readonly DEFAULT_SERVER_NAME = 'NOT_IN_DAO'
  private readonly listeners: DeploymentListener[] = []
  private readonly pointersBeingDeployed: Map<EntityType, Set<Pointer>> = new Map()
  private historySize: number = 0

  constructor(
    private readonly storage: ServiceStorage,
    private readonly pointerManager: PointerManager,
    private readonly identityProvider: IdentityProvider,
    private readonly failedDeploymentsManager: FailedDeploymentsManager,
    private readonly deploymentManager: DeploymentManager,
    private readonly validations: Validations,
    private readonly repository: Repository,
    private readonly cache: CacheByType<Pointer, Entity>
  ) {}

  async start(): Promise<void> {
    const amountOfDeployments = await this.repository.task((task) => task.deployments.getAmountOfDeployments(), {
      priority: DB_REQUEST_PRIORITY.HIGH
    })
    for (const [entityType, amount] of amountOfDeployments) {
      this.historySize += amount
      TOTAL_AMOUNT_OF_DEPLOYMENTS.inc({ entity_type: entityType }, amount)
    }
  }

  deployEntity(
    files: ContentFile[],
    entityId: EntityId,
    auditInfo: LocalDeploymentAuditInfo,
    origin: string,
    task?: Database
  ): Promise<DeploymentResult> {
    return this.deployInternal(files, entityId, auditInfo, ValidationContext.LOCAL, origin, task)
  }

  deployToFix(
    files: ContentFile[],
    entityId: EntityId,
    auditInfo: LocalDeploymentAuditInfo,
    origin: string,
    task?: Database
  ): Promise<DeploymentResult> {
    return this.deployInternal(files, entityId, auditInfo, ValidationContext.FIX_ATTEMPT, origin, task)
  }

  deployLocalLegacy(
    files: ContentFile[],
    entityId: string,
    auditInfo: LocalDeploymentAuditInfo,
    task?: Database
  ): Promise<DeploymentResult> {
    return this.deployInternal(files, entityId, auditInfo, ValidationContext.LOCAL_LEGACY_ENTITY, 'legacy', task)
  }

  private async deployInternal(
    files: ContentFile[],
    entityId: EntityId,
    auditInfo: AuditInfo | LocalDeploymentAuditInfo,
    validationContext: ValidationContext,
    origin: string,
    task?: Database
  ): Promise<DeploymentResult> {
    const validation = this.validations.getInstance()

    // Find entity file and make sure its hash is the expected
    const entityFile: ContentFile = ServiceImpl.findEntityFile(files)
    const entityFileHash = await Hashing.calculateHash(entityFile)
    validation.validateEntityHash(entityId, entityFileHash, validationContext)

    // Parse entity file into an Entity
    const entity: Entity = EntityFactory.fromFile(entityFile, entityId)

    // Validate signature
    await validation.validateSignature(entityId, entity.timestamp, auditInfo.authChain, validationContext)

    // Validate entity
    validation.validateEntity(entity, validationContext)

    // Validate that the entity is recent
    validation.validateDeploymentIsRecent(entity, validationContext)

    // Calculate the owner address from the auth chain
    const ownerAddress = ContentAuthenticator.ownerAddress(auditInfo.authChain)

    // Validate that Decentraland performed the deployment (only for legacy entities)
    validation.validateDecentralandAddress(ownerAddress, validationContext)

    // Validate request size
    validation.validateRequestSize(files, entity.pointers, validationContext)

    // Validate ethAddress access
    await validation.validateAccess(entity.type, entity.pointers, entity.timestamp, ownerAddress, validationContext)

    // Hash all files, and validate them
    const hashEntries: { hash: ContentFileHash; file: ContentFile }[] = await Hashing.calculateHashes(files)
    const hashes: Map<ContentFileHash, ContentFile> = new Map(hashEntries.map(({ hash, file }) => [hash, file]))

    // Check for if content is already stored
    const alreadyStoredContent: Map<ContentFileHash, boolean> = await this.isContentAvailable(
      Array.from(entity.content?.values() ?? [])
    )

    // Validate the entity's content property
    validation.validateContent(entity, hashes, alreadyStoredContent, validationContext)

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

    try {
      const response:
        | { auditInfoComplete: AuditInfo; wasEntityDeployed: boolean; affectedPointers: Pointer[] | undefined }
        | InvalidResult = await this.repository.reuseIfPresent(
        task,
        (db) =>
          db.txIf(async (transaction) => {
            const isEntityAlreadyDeployed = await this.isEntityAlreadyDeployed(entityId, transaction)

            // Validate if the entity can be re deployed
            await validation.validateThatEntityCanBeRedeployed(isEntityAlreadyDeployed, validationContext)

            // Validate that there is no entity with a higher version
            await validation.validateLegacyEntity(
              entity,
              auditInfo,
              (filters) => this.getDeployments({ filters }, transaction),
              validationContext
            )

            // Validate that there are no newer entities on pointers
            await validation.validateNoNewerEntitiesOnPointers(
              entity,
              (entity: Entity) => this.areThereNewerEntitiesOnPointers(entity, transaction),
              validationContext
            )

            // Validate that if the entity was already deployed, the status it was left is what we expect
            await validation.validateThatEntityFailedBefore(
              entity,
              (type, id) => this.failedDeploymentsManager.getDeploymentStatus(transaction.failedDeployments, type, id),
              validationContext
            )

            if (validation.getErrors().length > 0) {
              return { errors: validation.getErrors() }
            }

            const localTimestamp = Date.now()

            const auditInfoComplete: AuditInfo = {
              ...auditInfo,
              localTimestamp
            }

            let affectedPointers: Pointer[] | undefined

            if (!isEntityAlreadyDeployed) {
              // IF THIS POINT WAS REACHED, THEN THE DEPLOYMENT WILL BE COMMITTED

              // Calculate overwrites
              const { overwrote, overwrittenBy } = await this.pointerManager.calculateOverwrites(
                transaction.pointerHistory,
                entity
              )

              // Store the deployment
              const deploymentId = await this.deploymentManager.saveDeployment(
                transaction.deployments,
                transaction.migrationData,
                transaction.content,
                entity,
                auditInfoComplete,
                overwrittenBy
              )

              // Modify active pointers
              const result = await this.pointerManager.referenceEntityFromPointers(
                transaction.lastDeployedPointers,
                deploymentId,
                entity
              )
              affectedPointers = Array.from(result.keys())

              // Save deployment pointer changes
              await this.deploymentManager.savePointerChanges(
                transaction.deploymentPointerChanges,
                deploymentId,
                result
              )

              // Add to pointer history
              await this.pointerManager.addToHistory(transaction.pointerHistory, deploymentId, entity)

              // Set who overwrote who
              await this.deploymentManager.setEntitiesAsOverwritten(transaction.deployments, overwrote, deploymentId)

              // Store the entity's content
              await this.storeEntityContent(hashes, alreadyStoredContent)
            }

            // Mark deployment as successful (this does nothing it if hadn't failed on the first place)
            await this.failedDeploymentsManager.reportSuccessfulDeployment(
              transaction.failedDeployments,
              entity.type,
              entity.id
            )

            return { auditInfoComplete, wasEntityDeployed: !isEntityAlreadyDeployed, affectedPointers }
          }),
        { priority: DB_REQUEST_PRIORITY.HIGH }
      )

      if (!('auditInfoComplete' in response)) {
        return response
      } else if (response.wasEntityDeployed) {
        // Report deployment to listeners
        await Promise.all(
          this.listeners.map((listener) => listener({ entity, auditInfo: response.auditInfoComplete, origin }))
        )

        // Since we are still reporting the history size, add one to it
        this.historySize++
        TOTAL_AMOUNT_OF_DEPLOYMENTS.inc({ entity_type: entity.type })

        // Invalidate cache
        response.affectedPointers?.forEach((pointer) => this.cache.invalidate(entity.type, pointer))
      }
      return response.auditInfoComplete.localTimestamp
    } catch (error) {
      throw error
    } finally {
      // Update the current list of pointers being deployed
      const pointersCurrentlyBeingDeployed = this.pointersBeingDeployed.get(entity.type)!
      entity.pointers.forEach((pointer) => pointersCurrentlyBeingDeployed.delete(pointer))
    }
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
      return new Map(entries.flat())
    })

    // Since the same entity might appear many times, we must remove duplicates
    const grouped = new Map(allEntities.map((entity) => [entity.id, entity]))
    return Array.from(grouped.values())
  }

  private mapDeploymentsToEntities(history: PartialDeploymentHistory<Deployment>): Entity[] {
    return history.deployments.map(({ entityId, entityType, pointers, entityTimestamp, content, metadata }) => ({
      id: entityId,
      type: entityType,
      pointers,
      timestamp: entityTimestamp,
      content,
      metadata
    }))
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

  private storeEntityContent(
    hashes: Map<ContentFileHash, ContentFile>,
    alreadyStoredHashes: Map<ContentFileHash, boolean>
  ): Promise<any> {
    // If entity was committed, then store all it's content (that isn't already stored)
    const contentStorageActions: Promise<void>[] = Array.from(hashes.entries())
      .filter(([fileHash, file]) => !alreadyStoredHashes.get(fileHash))
      .map(([fileHash, file]) => this.storage.storeContent(fileHash, this.toStorageContent(file)))

    return Promise.all(contentStorageActions)
  }

  private toStorageContent(contentFile: ContentFile): StorageContent {
    return {
      path: contentFile.path,
      data: contentFile.content
    }
  }

  static findEntityFile(files: ContentFile[]): ContentFile {
    const filesWithName = files.filter((file) => file.name === ENTITY_FILE_NAME)
    if (filesWithName.length === 0) {
      throw new Error(`Failed to find the entity file. Please make sure that it is named '${ENTITY_FILE_NAME}'.`)
    } else if (filesWithName.length > 1) {
      throw new Error(
        `Found more than one file called '${ENTITY_FILE_NAME}'. Please make sure you upload only one with that name.`
      )
    }
    return filesWithName[0]
  }

  getContent(fileHash: ContentFileHash): Promise<ContentItem | undefined> {
    return this.storage.getContent(fileHash)
  }

  isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>> {
    return this.storage.isContentAvailable(fileHashes)
  }

  getStatus(): ServerStatus {
    return {
      name: this.getOwnName(),
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
    return this.storage.storeContent(fileHash, fromBuffer(content))
  }

  async deployEntityFromCluster(
    files: ContentFile[],
    entityId: EntityId,
    auditInfo: AuditInfo
  ): Promise<DeploymentResult> {
    const legacy = !!auditInfo.migrationData
    return await this.deployInternal(
      files,
      entityId,
      auditInfo,
      legacy ? ValidationContext.SYNCED_LEGACY_ENTITY : ValidationContext.SYNCED,
      'sync'
    )
  }

  async deployOverwrittenEntityFromCluster(
    entityFile: ContentFile,
    entityId: EntityId,
    auditInfo: AuditInfo
  ): Promise<DeploymentResult> {
    const legacy = !!auditInfo.migrationData
    return await this.deployInternal(
      [entityFile],
      entityId,
      auditInfo,
      legacy ? ValidationContext.OVERWRITTEN_LEGACY_ENTITY : ValidationContext.OVERWRITTEN,
      'sync'
    )
  }

  areEntitiesAlreadyDeployed(entityIds: EntityId[], task?: Database): Promise<Map<EntityId, boolean>> {
    return this.repository.reuseIfPresent(
      task,
      (db) => this.deploymentManager.areEntitiesDeployed(db.deployments, entityIds),
      { priority: DB_REQUEST_PRIORITY.HIGH }
    )
  }

  getDeployments(options?: DeploymentOptions, task?: Database): Promise<PartialDeploymentHistory<Deployment>> {
    return this.repository.reuseIfPresent(task, (db) =>
      db.taskIf((task) =>
        this.deploymentManager.getDeployments(task.deployments, task.content, task.migrationData, options)
      )
    )
  }

  getActiveDeploymentByContentHash(hash: string, task?: Database): Promise<EntityByHash> {
    return this.repository.reuseIfPresent(task, (db) =>
      db.taskIf((task) => this.deploymentManager.getDeploymentsByHash(task.deployments, hash))
    )
  }

  getPointerChanges(
    filters?: PointerChangesFilters,
    offset?: number,
    limit?: number,
    lastId?: string,
    task?: Database
  ): Promise<PartialDeploymentPointerChanges> {
    return this.repository.reuseIfPresent(task, (db) =>
      db.taskIf((task) =>
        this.deploymentManager.getPointerChanges(
          task.deploymentPointerChanges,
          task.deployments,
          filters,
          offset,
          limit,
          lastId
        )
      )
    )
  }

  getAllFailedDeployments() {
    return this.repository.run((db) => this.failedDeploymentsManager.getAllFailedDeployments(db.failedDeployments))
  }

  listenToDeployments(listener: DeploymentListener): void {
    this.listeners.push(listener)
  }

  private async isEntityAlreadyDeployed(entityId: EntityId, transaction: Database): Promise<boolean> {
    const result = await this.areEntitiesAlreadyDeployed([entityId], transaction)
    return result.get(entityId)!
  }

  private getOwnName(): ServerName {
    return this.identityProvider.getIdentityInDAO()?.name ?? ServiceImpl.DEFAULT_SERVER_NAME
  }
}
