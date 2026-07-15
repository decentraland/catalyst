import { AuthChain, Authenticator } from '@dcl/crypto'
import { Entity, EntityType, IPFSv2 } from '@dcl/schemas'
import { isDeepStrictEqual } from 'util'
import { EnvironmentConfig } from '../../Environment'
import { storeStreamsInBatches } from '../store-content'
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

// Stable fragment of the error returned when a concurrent deploy already holds one of the pointers.
// Exported so callers (e.g. the partial-deployment finalize retry) can detect this transient condition
// without coupling to the full, human-readable message text.
export const POINTERS_BEING_DEPLOYED_ERROR = 'currently being deployed'

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
    | 'pendingDeploymentsRepository'
    | 'entities'
  >
): TestableDeploymentService {
  const logger = components.logs.getLogger('deployer')
  const LEGACY_CONTENT_MIGRATION_TIMESTAMP: Date = new Date(1582167600000) // DCL Launch Day
  const pendingDeploymentTtlMs = components.env.getConfig<number>(EnvironmentConfig.PENDING_DEPLOYMENT_TTL)

  // The "request is not recent enough" (REQUEST_TTL_BACKWARDS) check. A partial (multi-request) upload
  // can legitimately span longer than that TTL, so a scene with a non-expired pending deployment is
  // measured against when the upload *started* (pending.created_at) rather than now.
  //
  // The pending-deployment lookup is gated to keep it off the hot path: it runs only when the entity is
  // already too old by wall clock (the common fresh deploy short-circuits with a pure comparison) and
  // only for scenes (the only entity type that can be partially uploaded). So profiles and other
  // high-volume deploys never touch pending_deployments here.
  // True when the entity is older, by wall clock, than the vanilla REQUEST_TTL_BACKWARDS bound — i.e.
  // only a pending-upload anchor could have let it through the freshness check. The TTL-anchoring logic
  // and the finalize current-access gate both key off this exact condition, so it is defined once here
  // to keep them from drifting. (Comparison, not `<=`, so an unset TTL — `x > undefined` is false —
  // behaves as before.)
  function isOlderThanRequestTtlBackwards(entity: Entity): boolean {
    const backwards = components.env.getConfig<number>(EnvironmentConfig.REQUEST_TTL_BACKWARDS)
    return Date.now() - entity.timestamp > backwards
  }

  async function isRequestTtlBackwards(entity: Entity): Promise<boolean> {
    const backwards = components.env.getConfig<number>(EnvironmentConfig.REQUEST_TTL_BACKWARDS)
    // Anchoring on an earlier pending.created_at can only make this smaller, so if the entity is not
    // already too old measured against now, no anchor changes the answer. This branch also covers the
    // hot path (fresh deploys) and non-scene types, keeping the pending lookup off them entirely.
    if (!isOlderThanRequestTtlBackwards(entity)) {
      return false
    }
    // Too old by wall clock. Only scenes can be partial uploads, so only they can have a pending anchor.
    if (entity.type !== EntityType.SCENE) {
      return true
    }
    const pending = await components.pendingDeploymentsRepository.getByEntityId(components.database, entity.id)
    if (pending && Date.now() - pending.createdAt.getTime() <= pendingDeploymentTtlMs) {
      return pending.createdAt.getTime() - entity.timestamp > backwards
    }
    return true
  }

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

        // If this entity had a pending (partial) deployment, it is now fully deployed — drop its
        // staging row atomically with the deployment. Covers both auto-finalize of a partial upload
        // and a vanilla deploy of a previously-staged entity. No-op (single PK delete) otherwise.
        await components.pendingDeploymentsRepository.deleteByEntityId(database, entity.id)
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
    //
    // Unlike the old getDeployments path, this does not exclude denylisted deployments: a newer
    // denylisted entity on the same pointers now blocks re-deploying an older one. That is intentional —
    // deployment temporal ordering is a property of the history and must not depend on the
    // content-serving denylist, which changes independently and is not part of happenedBefore.
    return components.deploymentsRepository.hasNewerDeploymentOnPointers(components.database, entity)
  }

  async function storeEntityContent(hashes: Map<string, Uint8Array>): Promise<void> {
    // Check for if content is already stored
    const alreadyStoredHashes: Map<string, boolean> = await components.storage.existMultiple(Array.from(hashes.keys()))

    // Store all the entity's not-already-stored content, in bounded-parallel batches (see helper).
    const filesToStore = Array.from(hashes).filter(([fileHash]) => !alreadyStoredHashes.get(fileHash))
    await storeStreamsInBatches(components.storage, filesToStore)
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
        isRequestTtlBackwards: (entity) => isRequestTtlBackwards(entity)
      }
    )

    // If there is an error in the server side validation, we won't run protocol validations
    if (serverValidationResult.ok == false) {
      return {
        ok: false,
        errors: [serverValidationResult.message]
      }
    }

    const protocolResult = await components.validator.validate({
      // TODO: remove as any after fixing content validator
      entity: entity as any,
      auditInfo,
      files: hashes
    })
    if (!protocolResult.ok) {
      return protocolResult
    }

    // The protocol access validation above is historical: it proves ownership at entity.timestamp's
    // block (required for sync/replay). Vanilla deploys bound that staleness to REQUEST_TTL_BACKWARDS
    // (~minutes), but a scene completing a partial upload may be up to PENDING_DEPLOYMENT_TTL (~24h)
    // old — long enough for the LAND to have been sold mid-upload. When the entity is older than the
    // vanilla bound (i.e. only a pending-upload anchor let it through the TTL check above), require
    // access against the CURRENT chain state too, so a seller can't finalize onto land they no longer
    // own. Fresh deploys never reach this (the wall-clock condition fails), so the hot path is
    // unaffected; it covers both completion paths (auto-finalize and a vanilla POST of a pending
    // entity) because both go through this pipeline.
    if (context === DeploymentContext.LOCAL && entity.type === EntityType.SCENE) {
      if (isOlderThanRequestTtlBackwards(entity)) {
        const currentAccessResult = await components.validator.validateCurrentAccess({
          entity: entity as any,
          auditInfo,
          files: hashes
        })
        if (!currentAccessResult.ok) {
          return {
            ok: false,
            errors: currentAccessResult.errors ?? [
              'The deployer no longer has access to the entity pointers (access is required both when a partial upload starts and when it is finalized).'
            ]
          }
        }
      }
    }

    return protocolResult
  }

  return {
    setRateLimiter(rl: IDeployRateLimiterComponent) {
      rateLimiter = rl
    },
    // Exposes the in-process rate-limiter to the partial-deployment staging path so a staging request
    // is subject to the same limit as a full deploy, without duplicating limiter state.
    isRateLimited(entityType: EntityType, pointers: string[]): boolean {
      return rateLimiter.isRateLimited(entityType, pointers)
    },
    getRateLimitTtlSeconds(entityType: EntityType): number {
      return rateLimiter.getRateLimitTtlSeconds(entityType)
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
          kind: 'pointer-conflict',
          errors: [
            `The following pointers are ${POINTERS_BEING_DEPLOYED_ERROR}: '${overlappingPointers.join()}'. Please try again in a few seconds.`
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
