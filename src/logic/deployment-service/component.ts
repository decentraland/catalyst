import { bufferToStream } from '@dcl/catalyst-storage/dist/content-item'
import { AuthChain, Authenticator } from '@dcl/crypto'
import { Entity, EntityType, IPFSv2 } from '@dcl/schemas'
import { isDeepStrictEqual } from 'util'
import { EnvironmentConfig } from '../../Environment'
import {
  AuditInfo,
  DeploymentContext,
  DeploymentFiles,
  DeploymentResult,
  InvalidResult,
  LocalDeploymentAuditInfo,
  isInvalidDeployment
} from '../../deployment-types'
import { DatabaseClient } from '../../adapters/database'
import { AppComponents, EntityVersion } from '../../types'
import { ICrypto } from '../crypto'
import { calculateOverwrites, saveDeploymentAndContentFiles } from '../deployments'
import * as pointerBookkeeping from './pointer-bookkeeping'
import { createDeployRateLimiter, IDeployRateLimiterComponent } from './rate-limiter'
import * as serverValidator from './server-validator'
import ms from 'ms'
import { TestableDeploymentService } from './types'

// Upper bound on concurrent content-file writes within a single deployment. Content files are
// content-addressed and independent, so they can be written in parallel; the cap keeps a single
// many-file entity from fanning out into an unbounded number of simultaneous storage writes.
const CONTENT_STORE_CONCURRENCY = 10

export function isIPFSHash(hash: string): boolean {
  return IPFSv2.validate(hash)
}

/**
 * Compare two entities' metadata using deep equality (order-independent).
 * id, timestamp, version and pointers are top-level Entity fields, not
 * inside metadata, so they are excluded automatically.
 * Since ADR-290, profiles no longer carry content files so only metadata
 * is compared.
 */
export function isEntityContentUnchanged(newEntity: Entity, activeEntity: Entity): boolean {
  return isDeepStrictEqual(newEntity.metadata, activeEntity.metadata)
}

/**
 * This function will take some deployment files and hash them. They might come already hashed, and if that is the case we will just return them.
 * They could come hashed because the denylist decorator might have already hashed them for its own validations. In order to avoid re-hashing
 * them in the service (because there might be hundreds of files), we will send the hash result.
 */
export async function hashFiles(
  crypto: ICrypto,
  files: DeploymentFiles,
  entityId: string
): Promise<Map<string, Uint8Array>> {
  if (files instanceof Map) {
    return files
  } else {
    const hashEntries = isIPFSHash(entityId)
      ? await crypto.calculateIPFSHashes(files)
      : await crypto.calculateDeprecatedHashes(files)
    return new Map(hashEntries.map(({ hash, file }) => [hash, file]))
  }
}

export function createDeploymentService(
  components: Pick<
    AppComponents,
    | 'metrics'
    | 'storage'
    | 'failedDeployments'
    | 'validator'
    | 'logs'
    | 'crypto'
    | 'database'
    | 'deployedEntitiesBloomFilter'
    | 'env'
    | 'activeEntities'
    | 'denylist'
    | 'deploymentsRepository'
    | 'contentFilesRepository'
    | 'entities'
  >
): TestableDeploymentService {
  const logger = components.logs.getLogger('deployer')
  const LEGACY_CONTENT_MIGRATION_TIMESTAMP: Date = new Date(1582167600000) // DCL Launch Day

  // In-process deploy rate limiter. Defaults to a real instance built from env config;
  // tests swap it via `setRateLimiter` (see TestableDeploymentService).
  let rateLimiter: IDeployRateLimiterComponent = createDeployRateLimiter(
    { logs: components.logs, metrics: components.metrics },
    {
      defaultTtl: components.env.getConfig(EnvironmentConfig.DEPLOYMENTS_DEFAULT_RATE_LIMIT_TTL) ?? ms('1m'),
      defaultMax: components.env.getConfig(EnvironmentConfig.DEPLOYMENTS_DEFAULT_RATE_LIMIT_MAX) ?? 300,
      entitiesConfigTtl:
        components.env.getConfig<Map<EntityType, number>>(EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_TTL) ?? new Map(),
      entitiesConfigMax:
        components.env.getConfig<Map<EntityType, number>>(EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_MAX) ?? new Map(),
      entitiesConfigUnchangedTtl: new Map([[EntityType.PROFILE, ms('5m')]]) // ms, converted to seconds internally
    }
  )

  // In-memory concurrency gate ensuring a single deploy can hold a given pointer
  // at a time. Pointers are partitioned by entity type — locks on the same pointer
  // across different types are independent.
  const pointersBeingDeployed: Map<EntityType, Set<string>> = new Map()

  function tryAcquirePointerLocks(entityType: EntityType, pointers: string[]): string[] {
    const inFlight = pointersBeingDeployed.get(entityType) ?? new Set<string>()
    const conflicts = pointers.filter((pointer) => inFlight.has(pointer))
    if (conflicts.length > 0) {
      return conflicts
    }
    for (const pointer of pointers) {
      inFlight.add(pointer)
    }
    pointersBeingDeployed.set(entityType, inFlight)
    return []
  }

  function releasePointerLocks(entityType: EntityType, pointers: string[]): void {
    const inFlight = pointersBeingDeployed.get(entityType)
    if (!inFlight) return
    for (const pointer of pointers) {
      inFlight.delete(pointer)
    }
    if (inFlight.size === 0) {
      pointersBeingDeployed.delete(entityType)
    }
  }

  function calculateIfLegacy(entity: Entity, authChain: AuthChain, context: DeploymentContext): DeploymentContext {
    if (isLegacyEntityV2(entity, authChain, context)) {
      return DeploymentContext.SYNCED_LEGACY_ENTITY
    }
    return context
  }

  // Legacy v2 content entities are only supported when syncing or fix attempt
  function isLegacyEntityV2(entity: Entity, authChain: AuthChain, context: DeploymentContext): boolean {
    return (
      (context === DeploymentContext.FIX_ATTEMPT || context === DeploymentContext.SYNCED) &&
      new Date(entity.timestamp) < LEGACY_CONTENT_MIGRATION_TIMESTAMP &&
      components.crypto.isAddressOwnedByDecentraland(Authenticator.ownerAddress(authChain))
    )
  }

  async function storeDeploymentInDatabase(
    database: DatabaseClient,
    entityId: string,
    entity: Entity,
    auditInfo: LocalDeploymentAuditInfo,
    hashes: Map<string, Uint8Array>,
    context: DeploymentContext,
    isContentUnchanged: boolean,
    // Idempotency result from deployEntity's earlier getEntityById check, threaded in to avoid a second
    // identical query per deploy. It is `undefined` on the normal path (deployEntity returns early when
    // the entity already exists), and same-entity concurrent deploys are excluded by the pointer locks.
    deployedEntity: { entityId: string; localTimestamp: number } | undefined
  ): Promise<InvalidResult | { auditInfoComplete: AuditInfo; wasEntityDeployed: boolean }> {
    const isEntityAlreadyDeployed = !!deployedEntity

    const validationResult = await validateDeployment(
      entity,
      context,
      isEntityAlreadyDeployed,
      auditInfo,
      hashes,
      isContentUnchanged
    )

    if (!validationResult.ok) {
      logger.warn(`Validations for deployment failed`, {
        entityId,
        errors: validationResult.errors?.join(',') ?? ''
      })
      return {
        errors: validationResult.errors ?? ['The validateDeployment was not successful but it did not return any error']
      }
    }

    const auditInfoComplete: AuditInfo = {
      ...auditInfo,
      version: EntityVersion.V3,
      localTimestamp: Date.now()
    }

    if (!isEntityAlreadyDeployed) {
      // IF THIS POINT WAS REACHED, THEN THE DEPLOYMENT WILL BE COMMITTED

      // Store the entity's content
      await storeEntityContent(hashes)

      // Hoisted so the in-memory cache can be updated *after* the transaction commits (see below).
      let clearedPointers: string[] = []
      let setPointers: string[] = []

      await components.database.transaction(async (database) => {
        // Calculate overwrites
        const { overwrote, overwrittenBy } = await calculateOverwrites(components, database, entity)

        // Store the deployment
        const deploymentId = await saveDeploymentAndContentFiles(
          components,
          database,
          entity,
          auditInfoComplete,
          overwrittenBy
        )
        // Modify active pointers
        const pointersFromEntity = await pointerBookkeeping.referenceEntityFromPointers(
          components.deploymentsRepository,
          database,
          entity,
          overwrote,
          overwrittenBy !== null
        )

        // Update pointers and active entities
        const reduced = Array.from(pointersFromEntity).reduce(
          (acc, current) => {
            if (current[1].after === pointerBookkeeping.DELTA_POINTER_RESULT.CLEARED)
              acc.clearedPointers.push(current[0])
            if (current[1].after === pointerBookkeeping.DELTA_POINTER_RESULT.SET) acc.setPointers.push(current[0])
            return acc
          },
          { clearedPointers: [] as string[], setPointers: [] as string[] }
        )
        clearedPointers = reduced.clearedPointers
        setPointers = reduced.setPointers

        // Persist the active_pointers rows inside the transaction so they commit atomically with the
        // deployment. The in-memory cache is updated only after commit (below), never here.
        if (clearedPointers.length > 0) {
          await components.activeEntities.updateInDatabase(database, clearedPointers, 'NOT_ACTIVE_ENTITY')
        }
        if (setPointers.length > 0) {
          await components.activeEntities.updateInDatabase(database, setPointers, entity)
        }

        // Set who overwrote who
        await components.deploymentsRepository.setEntitiesAsOverwritten(database, overwrote, deploymentId)
      }, 'tx_deploy_entity')

      // Now that the transaction has committed, reflect the new active pointers in the in-memory cache.
      // If the transaction had rolled back, none of this runs, so the cache never diverges from the DB.
      if (clearedPointers.length > 0) {
        components.activeEntities.updateInCache(clearedPointers, 'NOT_ACTIVE_ENTITY')
      }
      if (setPointers.length > 0) {
        components.activeEntities.updateInCache(setPointers, entity)
      }
      // Refresh collection/third-party listings for both added and cleared item pointers, so a new
      // item appears and an overwritten-off one disappears without waiting for the 24h TTL.
      components.activeEntities.invalidatePrefixCaches(entity, clearedPointers)
    } else {
      logger.info(`Entity already deployed`, { entityId })
      auditInfoComplete.localTimestamp = deployedEntity.localTimestamp
    }

    // Mark deployment as successful (this does nothing it if hadn't failed on the first place)
    await components.failedDeployments.removeFailedDeployment(entity.id)

    return { auditInfoComplete, wasEntityDeployed: !isEntityAlreadyDeployed }
  }

  /** Check if there are newer entities on the given entity's pointers */
  async function areThereNewerEntitiesOnPointers(entity: Entity): Promise<boolean> {
    // Single EXISTS probe instead of fetching up to 500 full deployment rows (with metadata + a
    // content_files query) only to compare timestamps in JS. The probe encodes the same
    // happenedBefore(entity, D) ordering and also considers all rows, not just the first page.
    return components.deploymentsRepository.hasNewerDeploymentOnPointers(components.database, entity)
  }

  async function storeEntityContent(hashes: Map<string, Uint8Array>): Promise<void> {
    // Check for if content is already stored
    const alreadyStoredHashes: Map<string, boolean> = await components.storage.existMultiple(Array.from(hashes.keys()))

    // Store all the entity's not-already-stored content. The files are independent
    // (content-addressed) and this runs before/outside the deployment transaction, so write
    // them in bounded-parallel batches instead of one at a time to speed up multi-file deploys.
    const filesToStore = Array.from(hashes).filter(([fileHash]) => !alreadyStoredHashes.get(fileHash))
    for (let i = 0; i < filesToStore.length; i += CONTENT_STORE_CONCURRENCY) {
      const batch = filesToStore.slice(i, i + CONTENT_STORE_CONCURRENCY)
      await Promise.all(
        batch.map(([fileHash, content]) => components.storage.storeStream(fileHash, bufferToStream(content)))
      )
    }
  }

  async function validateDeployment(
    entity: Entity,
    context: DeploymentContext,
    isEntityDeployedAlready: boolean,
    auditInfo: LocalDeploymentAuditInfo,
    hashes: Map<string, Uint8Array>,
    isContentUnchanged: boolean
  ): Promise<{ ok: boolean; errors?: string[] }> {
    // When deploying a new entity in some context which is not sync, we run some server side checks
    const serverValidationResult = await serverValidator.validateForServer(
      components.failedDeployments,
      entity,
      context,
      {
        areThereNewerEntities: (entity) => areThereNewerEntitiesOnPointers(entity),
        isEntityDeployedAlready: () => isEntityDeployedAlready,
        isNotFailedDeployment: async (entity) =>
          (await components.failedDeployments.findFailedDeployment(entity.id)) === undefined,
        isEntityRateLimited: (entity) =>
          rateLimiter.isRateLimited(entity.type, entity.pointers) ||
          (entity.type === EntityType.PROFILE &&
            isContentUnchanged &&
            rateLimiter.isUnchangedDeploymentRateLimited(entity.type, entity.pointers)),
        isRequestTtlBackwards: (entity) =>
          Date.now() - entity.timestamp > components.env.getConfig<number>(EnvironmentConfig.REQUEST_TTL_BACKWARDS)
      }
    )

    // If there is an error in the server side validation, we won't run protocol validations
    if (serverValidationResult.ok == false) {
      return {
        ok: false,
        errors: [serverValidationResult.message]
      }
    }

    return await components.validator.validate({
      // TODO: remove as any after fixing content validator
      entity: entity as any,
      auditInfo,
      files: hashes
    })
  }

  return {
    setRateLimiter(rl: IDeployRateLimiterComponent) {
      rateLimiter = rl
    },
    async deployEntity(
      files: DeploymentFiles,
      entityId: string,
      auditInfo: LocalDeploymentAuditInfo,
      context: DeploymentContext
    ): Promise<DeploymentResult> {
      const deployedEntity = await components.deploymentsRepository.getEntityById(components.database, entityId)
      // entity deployments are idempotent operations
      if (deployedEntity) {
        logger.debug(`Entity was already deployed`, {
          entityId,
          deployedTimestamp: deployedEntity.localTimestamp,
          delta: Date.now() - deployedEntity.localTimestamp
        })
        return deployedEntity.localTimestamp
      }

      // Hash all files
      const hashes: Map<string, Uint8Array> = await hashFiles(components.crypto, files, entityId)

      // Find entity file
      const entityFile = hashes.get(entityId)
      if (!entityFile) {
        return InvalidResult({ errors: [`Failed to find the entity file.`] })
      }

      // Parse entity file into an Entity
      let entity: Entity
      try {
        entity = components.entities.parse(entityFile, entityId)
        if (!entity) {
          return InvalidResult({ errors: ['There was a problem parsing the entity, it was null'] })
        }
      } catch (error) {
        logger.warn(`There was an error parsing the entity: ${error}`)
        return InvalidResult({ errors: ['There was a problem parsing the entity'] })
      }

      // Reject entities without pointers up front (before claiming any pointer locks)
      if (entity.pointers.length === 0)
        return InvalidResult({
          errors: [`The entity does not have any pointer.`]
        })

      // Try to claim the pointers for this in-flight deploy. If any of them are
      // already being deployed by a concurrent caller, fail fast without acquiring
      // any locks.
      const overlappingPointers = tryAcquirePointerLocks(entity.type, entity.pointers)
      if (overlappingPointers.length > 0) {
        return InvalidResult({
          errors: [
            `The following pointers are currently being deployed: '${overlappingPointers.join()}'. Please try again in a few seconds.`
          ]
        })
      }

      // Wrap the entire post-acquire body in try/finally so a synchronous throw
      // in calculateIfLegacy or the unchanged-content probe still releases the
      // pointer lock. Without this guard, an unexpected exception between
      // tryAcquire and the await below would orphan the lock until process restart.
      try {
        const contextToDeploy: DeploymentContext = calculateIfLegacy(entity, auditInfo.authChain, context)

        // Check if the entity content is unchanged from the currently active entity.
        // Only relevant for profiles, which have unchanged content rate limiting.
        let isContentUnchanged = false
        if (context === DeploymentContext.LOCAL && entity.type === EntityType.PROFILE) {
          try {
            const activeEntities = await components.activeEntities.withPointers(components.database, entity.pointers)
            if (activeEntities.length > 0) {
              isContentUnchanged = isEntityContentUnchanged(entity, activeEntities[0])
            }
          } catch (error) {
            logger.warn(`Failed to check if entity content is unchanged, assuming changed`, { entityId })
          }
        }

        logger.info(`Deploying entity`, {
          entityId,
          pointers: entity.pointers.join(' ')
        })

        const storeResult = await storeDeploymentInDatabase(
          components.database,
          entityId,
          entity,
          auditInfo,
          hashes,
          contextToDeploy,
          isContentUnchanged,
          deployedEntity
        )

        if (!storeResult) {
          logger.error(`Error calling storeDeploymentInDatabase, returned void`, {
            entityId,
            auditInfo: JSON.stringify(auditInfo),
            entity: JSON.stringify(entity),
            context,
            storeResult: JSON.stringify(storeResult)
          })
          return InvalidResult({ errors: ['An internal server error occurred. This will raise an automatic alarm.'] })
        } else if (isInvalidDeployment(storeResult)) {
          logger.error(`Error deploying entity`, {
            entityId,
            pointers: entity.pointers.join(' '),
            errors: storeResult.errors.join(' ')
          })
          if (storeResult.errors.length == 0) {
            logger.error(`Invalid InvalidResult, got 0 errors`, {
              entityId,
              auditInfo: JSON.stringify(auditInfo),
              entity: JSON.stringify(entity),
              context
            })
          }
          return storeResult
        } else if (storeResult.wasEntityDeployed) {
          logger.info(`Entity deployed`, {
            entityId,
            pointers: entity.pointers.join(' ')
          })
          components.metrics.increment(
            'total_deployments_count',
            { entity_type: entity.type, deployment_context: context },
            1
          )

          // Only record in rate limiter for LOCAL deployments to prevent
          // synced/fix-attempt entities from polluting the cache
          if (context === DeploymentContext.LOCAL) {
            rateLimiter.newDeployment(entity.type, entity.pointers, storeResult.auditInfoComplete.localTimestamp)

            if (entity.type === EntityType.PROFILE && isContentUnchanged) {
              rateLimiter.newUnchangedDeployment(
                entity.type,
                entity.pointers,
                storeResult.auditInfoComplete.localTimestamp
              )
            }
          }
        }

        // add the entity to the bloom filter to prevent expensive operations during the sync
        components.deployedEntitiesBloomFilter.add(entity.id)

        if (!storeResult.auditInfoComplete.localTimestamp) {
          logger.error(`auditInfoComplete is misbehaving`, {
            auditInfoComplete: JSON.stringify(storeResult.auditInfoComplete)
          })
        }

        // TODO: review this
        return storeResult.auditInfoComplete.localTimestamp || Date.now()
      } catch (error) {
        logger.error(`There was an error deploying the entity: ${error}`, { entityId })
        return InvalidResult({
          errors: [`There was an error deploying the entity`]
        })
      } finally {
        releasePointerLocks(entity.type, entity.pointers)
      }
    }
  }
}
