import { bufferToStream } from '@dcl/catalyst-storage/dist/content-item'
import { AuthChain, Authenticator } from '@dcl/crypto'
import { Entity, EntityType, IPFSv2 } from '@dcl/schemas'
import { isDeepStrictEqual } from 'util'
import { getEntityById, setEntitiesAsOverwritten } from '../../adapters/deployments-repository'
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
import { DatabaseClient } from '../../ports/postgres'
import { happenedBefore } from '../../service/time/TimeSorting'
import { AppComponents, EntityVersion } from '../../types'
import { calculateOverwrites, getDeployments, saveDeploymentAndContentFiles } from '../deployments'
import { getEntityFromBuffer } from '../entity-parser'
import { calculateDeprecatedHashes, calculateIPFSHashes } from '../hashing'
import { DELTA_POINTER_RESULT } from '../pointer-manager'
import { IDeploymentService } from './types'

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
export async function hashFiles(files: DeploymentFiles, entityId: string): Promise<Map<string, Uint8Array>> {
  if (files instanceof Map) {
    return files
  } else {
    const hashEntries = isIPFSHash(entityId) ? await calculateIPFSHashes(files) : await calculateDeprecatedHashes(files)
    return new Map(hashEntries.map(({ hash, file }) => [hash, file]))
  }
}

export function createDeploymentService(
  components: Pick<
    AppComponents,
    | 'metrics'
    | 'storage'
    | 'pointerManager'
    | 'pointerLockManager'
    | 'failedDeployments'
    | 'deployRateLimiter'
    | 'validator'
    | 'serverValidator'
    | 'logs'
    | 'authenticator'
    | 'database'
    | 'deployedEntitiesBloomFilter'
    | 'env'
    | 'activeEntities'
    | 'denylist'
  >
): IDeploymentService {
  const logger = components.logs.getLogger('deployer')
  const LEGACY_CONTENT_MIGRATION_TIMESTAMP: Date = new Date(1582167600000) // DCL Launch Day

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
      components.authenticator.isAddressOwnedByDecentraland(Authenticator.ownerAddress(authChain))
    )
  }

  async function storeDeploymentInDatabase(
    database: DatabaseClient,
    entityId: string,
    entity: Entity,
    auditInfo: LocalDeploymentAuditInfo,
    hashes: Map<string, Uint8Array>,
    context: DeploymentContext,
    isContentUnchanged: boolean
  ): Promise<InvalidResult | { auditInfoComplete: AuditInfo; wasEntityDeployed: boolean }> {
    const deployedEntity = await getEntityById(database, entityId)
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

      await components.database.transaction(async (database) => {
        // Calculate overwrites
        const { overwrote, overwrittenBy } = await calculateOverwrites(database, entity)

        // Store the deployment
        const deploymentId = await saveDeploymentAndContentFiles(database, entity, auditInfoComplete, overwrittenBy)
        // Modify active pointers
        const pointersFromEntity = await components.pointerManager.referenceEntityFromPointers(
          database,
          entity,
          overwrote,
          overwrittenBy !== null
        )

        // Update pointers and active entities
        const { clearedPointers, setPointers } = Array.from(pointersFromEntity).reduce(
          (acc, current) => {
            if (current[1].after === DELTA_POINTER_RESULT.CLEARED) acc.clearedPointers.push(current[0])
            if (current[1].after === DELTA_POINTER_RESULT.SET) acc.setPointers.push(current[0])
            return acc
          },
          { clearedPointers: [] as string[], setPointers: [] as string[] }
        )
        // invalidate pointers (points to an entity that is no longer active)
        // this case happen when the entity is overwritten
        if (clearedPointers.length > 0) {
          await components.activeEntities.clear(database, clearedPointers)
        }

        // update pointer (points to the new entity that is active)
        if (setPointers.length > 0) {
          await components.activeEntities.update(database, setPointers, entity)
        }

        // Set who overwrote who
        await setEntitiesAsOverwritten(database, overwrote, deploymentId)
      }, 'tx_deploy_entity')
    } else {
      logger.info(`Entity already deployed`, { entityId })
      auditInfoComplete.localTimestamp = deployedEntity.localTimestamp
    }

    // Mark deployment as successful (this does nothing it if hadn't failed on the first place)
    await components.failedDeployments.removeFailedDeployment(entity.id)

    return { auditInfoComplete, wasEntityDeployed: !isEntityAlreadyDeployed }
  }

  // todo: review if we can use entities cache to determine if there is a newer deployment
  /** Check if there are newer entities on the given entity's pointers */
  async function areThereNewerEntitiesOnPointers(entity: Entity): Promise<boolean> {
    // Validate that pointers aren't referring to an entity with a higher timestamp
    const { deployments: lastDeployments } = await getDeployments(components, components.database, {
      filters: { entityTypes: [entity.type], pointers: entity.pointers }
    })
    for (const lastDeployment of lastDeployments) {
      if (happenedBefore(entity, lastDeployment)) {
        return true
      }
    }
    return false
  }

  async function storeEntityContent(hashes: Map<string, Uint8Array>): Promise<any> {
    // Check for if content is already stored
    const alreadyStoredHashes: Map<string, boolean> = await components.storage.existMultiple(Array.from(hashes.keys()))

    // If entity was committed, then store all it's content (that isn't already stored)
    for (const [fileHash, content] of hashes) {
      if (!alreadyStoredHashes.get(fileHash)) {
        await components.storage.storeStream(fileHash, bufferToStream(content))
      }
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
    const serverValidationResult = await components.serverValidator.validate(entity, context, {
      areThereNewerEntities: (entity) => areThereNewerEntitiesOnPointers(entity),
      isEntityDeployedAlready: () => isEntityDeployedAlready,
      isNotFailedDeployment: async (entity) =>
        (await components.failedDeployments.findFailedDeployment(entity.id)) === undefined,
      isEntityRateLimited: (entity) =>
        components.deployRateLimiter.isRateLimited(entity.type, entity.pointers) ||
        (entity.type === EntityType.PROFILE &&
          isContentUnchanged &&
          components.deployRateLimiter.isUnchangedDeploymentRateLimited(entity.type, entity.pointers)),
      isRequestTtlBackwards: (entity) =>
        Date.now() - entity.timestamp > components.env.getConfig<number>(EnvironmentConfig.REQUEST_TTL_BACKWARDS)
    })

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
    async deployEntity(
      files: DeploymentFiles,
      entityId: string,
      auditInfo: LocalDeploymentAuditInfo,
      context: DeploymentContext
    ): Promise<DeploymentResult> {
      const deployedEntity = await getEntityById(components.database, entityId)
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
      const hashes: Map<string, Uint8Array> = await hashFiles(files, entityId)

      // Find entity file
      const entityFile = hashes.get(entityId)
      if (!entityFile) {
        return InvalidResult({ errors: [`Failed to find the entity file.`] })
      }

      // Parse entity file into an Entity
      let entity: Entity
      try {
        entity = getEntityFromBuffer(entityFile, entityId)
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
      const overlappingPointers = components.pointerLockManager.tryAcquire(entity.type, entity.pointers)
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
          isContentUnchanged
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
            components.deployRateLimiter.newDeployment(
              entity.type,
              entity.pointers,
              storeResult.auditInfoComplete.localTimestamp
            )

            if (entity.type === EntityType.PROFILE && isContentUnchanged) {
              components.deployRateLimiter.newUnchangedDeployment(
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
        components.pointerLockManager.release(entity.type, entity.pointers)
      }
    }
  }
}
