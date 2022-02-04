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
import { EnvironmentConfig } from '../Environment'
import { FailedDeployment, FailureReason } from '../ports/failedDeploymentsCache'
import { Database } from '../repository/Database'
import { DB_REQUEST_PRIORITY } from '../repository/RepositoryQueue'
import { bufferToStream, ContentItem } from '../storage/ContentStorage'
import { AppComponents } from '../types'
import { CacheByType } from './caching/Cache'
import { getDeployments } from './deployments/deployments'
import { DeploymentOptions } from './deployments/types'
import { EntityFactory } from './EntityFactory'
import {
  DeploymentContext,
  DeploymentFiles,
  DeploymentResult,
  InvalidResult,
  isInvalidDeployment,
  LocalDeploymentAuditInfo,
  MetaverseContentService
} from './Service'
import { happenedBefore } from './time/TimeSorting'

export class ServiceImpl implements MetaverseContentService {
  private static LOGGER: ILoggerComponent.ILogger
  private readonly pointersBeingDeployed: Map<EntityType, Set<Pointer>> = new Map()

  private readonly LEGACY_CONTENT_MIGRATION_TIMESTAMP: Date = new Date(1582167600000) // DCL Launch Day

  constructor(
    public components: Pick<
      AppComponents,
      | 'metrics'
      | 'storage'
      | 'pointerManager'
      | 'failedDeploymentsCache'
      | 'deploymentManager'
      | 'validator'
      | 'serverValidator'
      | 'repository'
      | 'logs'
      | 'authenticator'
      | 'database'
      | 'deployedEntitiesFilter'
      | 'env'
    >,
    private readonly cache: CacheByType<Pointer, Entity>,
    private readonly deploymentsCache: { cache: NodeCache; maxSize: number }
  ) {
    ServiceImpl.LOGGER = components.logs.getLogger('ServiceImpl')
  }

  async deployEntity(
    files: DeploymentFiles,
    entityId: EntityId,
    auditInfo: LocalDeploymentAuditInfo,
    context: DeploymentContext,
    task?: Database
  ): Promise<DeploymentResult> {
    const deployedEntity = await this.getEntityById(entityId, task)

    // entity deployments are idempotent operations
    if (deployedEntity) {
      ServiceImpl.LOGGER.debug(`Entity was already deployed`, {
        entityId,
        deployedTimestamp: deployedEntity.localTimestamp,
        delta: Date.now() - deployedEntity.localTimestamp
      })
      return deployedEntity.localTimestamp
    }

    // Hash all files
    const hashes: Map<ContentFileHash, Uint8Array> = await ServiceImpl.hashFiles(files, entityId)

    // Find entity file
    const entityFile = hashes.get(entityId)
    if (!entityFile) {
      return InvalidResult({ errors: [`Failed to find the entity file.`] })
    }

    // Parse entity file into an Entity
    let entity: Entity
    try {
      entity = EntityFactory.fromBufferWithId(entityFile, entityId)
      if (!entity) {
        return InvalidResult({ errors: ['There was a problem parsing the entity, it was null'] })
      }
    } catch (error) {
      ServiceImpl.LOGGER.error(`There was an error parsing the entity: ${error}`)
      return InvalidResult({ errors: ['There was a problem parsing the entity'] })
    }

    // Validate that the entity's pointers are not currently being modified
    const pointersCurrentlyBeingDeployed = this.pointersBeingDeployed.get(entity.type) ?? new Set()
    const overlappingPointers = entity.pointers.filter((pointer) => pointersCurrentlyBeingDeployed.has(pointer))
    if (overlappingPointers.length > 0) {
      return InvalidResult({
        errors: [
          `The following pointers are currently being deployed: '${overlappingPointers.join()}'. Please try again in a few seconds.`
        ]
      })
    }

    // Update the current list of pointers being deployed
    if (!entity.pointers || entity.pointers.length == 0)
      return InvalidResult({
        errors: [`The entity does not have any pointer.`]
      })

    entity.pointers.forEach((pointer) => pointersCurrentlyBeingDeployed.add(pointer))
    this.pointersBeingDeployed.set(entity.type, pointersCurrentlyBeingDeployed)

    const contextToDeploy: DeploymentContext = this.calculateIfLegacy(entity, auditInfo.authChain, context)

    try {
      ServiceImpl.LOGGER.info(`Deploying entity`, {
        entityId,
        pointers: entity.pointers.join(' ')
      })

      const storeResult = await this.storeDeploymentInDatabase(
        task,
        entityId,
        entity,
        auditInfo,
        hashes,
        contextToDeploy
      )

      if (!storeResult) {
        ServiceImpl.LOGGER.error(`Error calling storeDeploymentInDatabase, returned void`, {
          entityId,
          auditInfo: JSON.stringify(auditInfo),
          entity: JSON.stringify(entity),
          context,
          storeResult: JSON.stringify(storeResult)
        })
        return InvalidResult({ errors: ['An internal server error occurred. This will raise an automatic alarm.'] })
      } else if (isInvalidDeployment(storeResult)) {
        ServiceImpl.LOGGER.error(`Error deploying entity`, {
          entityId,
          pointers: entity.pointers.join(' '),
          errors: storeResult.errors.join(' ')
        })
        if (storeResult.errors.length == 0) {
          ServiceImpl.LOGGER.error(`Invalid InvalidResult, got 0 errors`, {
            entityId,
            auditInfo: JSON.stringify(auditInfo),
            entity: JSON.stringify(entity),
            context
          })
        }
        return storeResult
      } else if (storeResult.wasEntityDeployed) {
        ServiceImpl.LOGGER.info(`Entity deployed`, {
          entityId,
          pointers: entity.pointers.join(' ')
        })
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

      // add the entity to the bloom filter to prevent expensive operations during the sync
      this.components.deployedEntitiesFilter.add(entity.id)

      if (!storeResult.auditInfoComplete.localTimestamp) {
        ServiceImpl.LOGGER.error(`auditInfoComplete is missbehaving`, {
          auditInfoComplete: JSON.stringify(storeResult.auditInfoComplete)
        })
      }

      // TODO: review this
      return storeResult.auditInfoComplete.localTimestamp || Date.now()
    } catch (error) {
      ServiceImpl.LOGGER.error(`There was an error deploying the entity: ${error}`, { entityId })
      return InvalidResult({
        errors: [`There was an error deploying the entity`]
      })
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
    context: DeploymentContext
  ): Promise<
    | InvalidResult
    | { auditInfoComplete: AuditInfo; wasEntityDeployed: boolean; affectedPointers: Pointer[] | undefined }
  > {
    const deployedEntity = await this.getEntityById(entityId)
    const isEntityAlreadyDeployed = !!deployedEntity

    const validationResult = await this.validateDeployment(entity, context, isEntityAlreadyDeployed, auditInfo, hashes)

    if (!validationResult.ok) {
      ServiceImpl.LOGGER.warn(`Validations for deployment failed`, {
        entityId,
        errors: validationResult.errors?.join(',') ?? ''
      })
      return {
        errors: validationResult.errors ?? ['The validateDeployment was not successful but it did not return any error']
      }
    }

    const auditInfoComplete: AuditInfo = {
      ...auditInfo,
      version: entity.version,
      localTimestamp: Date.now()
    }

    let affectedPointers: Pointer[] | undefined

    if (!isEntityAlreadyDeployed) {
      // IF THIS POINT WAS REACHED, THEN THE DEPLOYMENT WILL BE COMMITTED

      // Store the entity's content
      await this.storeEntityContent(hashes)

      await this.components.repository.reuseIfPresent(
        task,
        (db) =>
          db.txIf(async (transaction) => {
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
          }),
        { priority: DB_REQUEST_PRIORITY.HIGH }
      )
    } else {
      ServiceImpl.LOGGER.info(`Entity already deployed`, { entityId })
      auditInfoComplete.localTimestamp = deployedEntity.localTimestamp
    }

    // Mark deployment as successful (this does nothing it if hadn't failed on the first place)
    this.components.failedDeploymentsCache.removeFailedDeployment(entity.id)

    return { auditInfoComplete, wasEntityDeployed: !isEntityAlreadyDeployed, affectedPointers }
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
    return this.components.failedDeploymentsCache.reportFailure({
      entityType,
      entityId,
      reason,
      authChain,
      errorDescription,
      failureTimestamp: Date.now()
    })
  }

  async getEntitiesByIds(ids: EntityId[]): Promise<Entity[]> {
    const deployments = await getDeployments(this.components, {
      filters: { entityIds: ids, onlyCurrentlyPointed: true }
    })
    return this.mapDeploymentsToEntities(deployments)
  }

  async getEntitiesByPointers(type: EntityType, pointers: Pointer[]): Promise<Entity[]> {
    const allEntities = await this.cache.get(type, pointers, async (type, pointers) => {
      const deployments = await getDeployments(this.components, {
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
        content: content?.map(({ key, hash }) => ({ file: key, hash })),
        metadata
      })
    )
  }

  /** Check if there are newer entities on the given entity's pointers */
  private async areThereNewerEntitiesOnPointers(entity: Entity): Promise<boolean> {
    // Validate that pointers aren't referring to an entity with a higher timestamp
    const { deployments: lastDeployments } = await getDeployments(this.components, {
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

  private async storeEntityContent(hashes: Map<ContentFileHash, Uint8Array>): Promise<any> {
    // Check for if content is already stored
    const alreadyStoredHashes: Map<ContentFileHash, boolean> = await this.components.storage.existMultiple(
      Array.from(hashes.keys())
    )

    // If entity was committed, then store all it's content (that isn't already stored)
    for (const [fileHash, content] of hashes) {
      if (!alreadyStoredHashes.get(fileHash)) {
        await this.components.storage.storeStream(fileHash, bufferToStream(content))
      }
    }
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

  getContent(fileHash: ContentFileHash): Promise<ContentItem | undefined> {
    return this.components.storage.retrieve(fileHash)
  }

  isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>> {
    return this.components.storage.existMultiple(fileHashes)
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

  getDeployments(options?: DeploymentOptions): Promise<PartialDeploymentHistory<Deployment>> {
    return getDeployments(this.components, options)
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
    return this.components.failedDeploymentsCache.getAllFailedDeployments()
  }

  private async validateDeployment(
    entity: Entity,
    context: DeploymentContext,
    isEntityDeployedAlready: boolean,
    auditInfo: LocalDeploymentAuditInfo,
    hashes: Map<string, Uint8Array>
  ): Promise<{ ok: boolean; errors?: string[] }> {
    // When deploying a new entity in some context which is not sync, we run some server side checks
    const serverValidationResult = await this.components.serverValidator.validate(entity, context, {
      areThereNewerEntities: (entity) => this.areThereNewerEntitiesOnPointers(entity),
      isEntityDeployedAlready: () => isEntityDeployedAlready,
      isNotFailedDeployment: (entity) =>
        this.components.failedDeploymentsCache.findFailedDeployment(entity.id) === undefined,
      isEntityRateLimited: (entity) => this.isEntityRateLimited(entity),
      isRequestTtlBackwards: (entity) =>
        Date.now() - entity.timestamp > this.components.env.getConfig<number>(EnvironmentConfig.REQUEST_TTL_BACKWARDS)
    })

    // If there is an error in the server side validation, we won't run protocol validations
    if (serverValidationResult.ok == false) {
      return {
        ok: false,
        errors: [serverValidationResult.message]
      }
    }

    return await this.components.validator.validate({
      entity,
      auditInfo,
      files: hashes
    })
  }
}
