import { bufferToStream } from '@dcl/catalyst-storage/dist/content-item'
import { AuthChain, Authenticator } from '@dcl/crypto'
import { Entity, EntityType, IPFSv2 } from '@dcl/schemas'
import {
  AuditInfo,
  DeploymentContext,
  DeploymentFiles,
  DeploymentResult,
  InvalidResult,
  isInvalidDeployment,
  LocalDeploymentAuditInfo
} from '../deployment-types'
import { EnvironmentConfig } from '../Environment'
import { getEntityById, setEntitiesAsOverwritten } from '../logic/database-queries/deployments-queries'
import { calculateOverwrites, getDeployments, saveDeploymentAndContentFiles } from '../logic/deployments'
import { calculateDeprecatedHashes, calculateIPFSHashes } from '../logic/hashing'
import { EntityFactory } from '../service/EntityFactory'
import { DELTA_POINTER_RESULT } from '../service/pointers/PointerManager'
import { happenedBefore } from '../service/time/TimeSorting'
import { AppComponents, EntityVersion } from '../types'

export function isIPFSHash(hash: string): boolean {
  return IPFSv2.validate(hash)
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

export interface Deployer {
  deployEntity(
    files: DeploymentFiles,
    entityId: string,
    auditInfo: LocalDeploymentAuditInfo,
    context: DeploymentContext
  ): Promise<DeploymentResult>
}

export function createDeployer(
  components: Pick<
    AppComponents,
    | 'metrics'
    | 'storage'
    | 'pointerManager'
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
    | 'clock'
  >
): Deployer {
  const logger = components.logs.getLogger('deployer')
  const LEGACY_CONTENT_MIGRATION_TIMESTAMP: Date = new Date(1582167600000) // DCL Launch Day
  const pointersBeingDeployed: Map<EntityType, Set<string>> = new Map()

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
    entityId: string,
    entity: Entity,
    auditInfo: LocalDeploymentAuditInfo,
    hashes: Map<string, Uint8Array>,
    context: DeploymentContext
  ): Promise<InvalidResult | { auditInfoComplete: AuditInfo; wasEntityDeployed: boolean }> {
    const deployedEntity = await getEntityById(components, entityId)
    const isEntityAlreadyDeployed = !!deployedEntity

    const validationResult = await validateDeployment(entity, context, isEntityAlreadyDeployed, auditInfo, hashes)

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
      localTimestamp: components.clock.now()
    }

    if (!isEntityAlreadyDeployed) {
      // IF THIS POINT WAS REACHED, THEN THE DEPLOYMENT WILL BE COMMITTED

      // Store the entity's content
      await storeEntityContent(hashes)
      logger.info('Entity stored')

      await components.database.transaction(async (database) => {
        // Calculate overwrites
        const { overwrote, overwrittenBy } = await calculateOverwrites(database, entity)
        logger.info('calculateOverwrites finished')

        // Store the deployment
        const deploymentId = await saveDeploymentAndContentFiles(database, entity, auditInfoComplete, overwrittenBy)
        logger.info('deployment and content files saved')
        // Modify active pointers
        const pointersFromEntity = await components.pointerManager.referenceEntityFromPointers(
          database,
          entity,
          overwrote,
          overwrittenBy !== null
        )
        logger.info('got pointers from entity')

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
          logger.info('clearning pointers')
          await components.activeEntities.clear(clearedPointers)
          logger.info('pointers cleaned')
        }

        // update pointer (points to the new entity that is active)
        if (setPointers.length > 0) {
          logger.info(`updating pointers ${setPointers.join(', ')}`)
          await components.activeEntities.update(setPointers, entity, database)
          logger.info(`pointers updated ${setPointers.join(',')}`)
        }
        logger.info('pointes and active entities updated')

        // Set who overwrote who
        await setEntitiesAsOverwritten(database, overwrote, deploymentId)
        logger.info('overwrites set')
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
    const { deployments: lastDeployments } = await getDeployments(components, {
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
    hashes: Map<string, Uint8Array>
  ): Promise<{ ok: boolean; errors?: string[] }> {
    // When deploying a new entity in some context which is not sync, we run some server side checks
    const serverValidationResult = await components.serverValidator.validate(entity, context, {
      areThereNewerEntities: (entity) => areThereNewerEntitiesOnPointers(entity),
      isEntityDeployedAlready: () => isEntityDeployedAlready,
      isNotFailedDeployment: (entity) => components.failedDeployments.findFailedDeployment(entity.id) === undefined,
      isEntityRateLimited: (entity) => components.deployRateLimiter.isRateLimited(entity.type, entity.pointers),
      isRequestTtlBackwards: (entity) =>
        components.clock.now() - entity.timestamp >
        components.env.getConfig<number>(EnvironmentConfig.REQUEST_TTL_BACKWARDS)
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
      const deployedEntity = await getEntityById(components, entityId)
      // entity deployments are idempotent operations
      if (deployedEntity) {
        logger.debug(`Entity was already deployed`, {
          entityId,
          deployedTimestamp: deployedEntity.localTimestamp,
          delta: components.clock.now() - deployedEntity.localTimestamp
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
        entity = EntityFactory.fromBufferWithId(entityFile, entityId)
        if (!entity) {
          return InvalidResult({ errors: ['There was a problem parsing the entity, it was null'] })
        }
      } catch (error) {
        logger.warn(`There was an error parsing the entity: ${error}`)
        return InvalidResult({ errors: ['There was a problem parsing the entity'] })
      }

      // Validate that the entity's pointers are not currently being modified
      const pointersCurrentlyBeingDeployed = pointersBeingDeployed.get(entity.type) ?? new Set()
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
      pointersBeingDeployed.set(entity.type, pointersCurrentlyBeingDeployed)

      const contextToDeploy: DeploymentContext = calculateIfLegacy(entity, auditInfo.authChain, context)

      try {
        logger.info(`Deploying entity`, {
          entityId,
          pointers: entity.pointers.join(' ')
        })

        const storeResult = await storeDeploymentInDatabase(entityId, entity, auditInfo, hashes, contextToDeploy)

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

          // Insert in deployments cache the updated entities
          components.deployRateLimiter.newDeployment(
            entity.type,
            entity.pointers,
            storeResult.auditInfoComplete.localTimestamp
          )
        }

        // add the entity to the bloom filter to prevent expensive operations during the sync
        components.deployedEntitiesBloomFilter.add(entity.id)

        if (!storeResult.auditInfoComplete.localTimestamp) {
          logger.error(`auditInfoComplete is misbehaving`, {
            auditInfoComplete: JSON.stringify(storeResult.auditInfoComplete)
          })
        }

        // TODO: review this
        return storeResult.auditInfoComplete.localTimestamp || components.clock.now()
      } catch (error) {
        logger.error(`There was an error deploying the entity: ${error}`, { entityId })
        return InvalidResult({
          errors: [`There was an error deploying the entity`]
        })
      } finally {
        // Remove the updated pointer from the list of current being deployed
        const pointersCurrentlyBeingDeployed = pointersBeingDeployed.get(entity.type)
        if (pointersCurrentlyBeingDeployed)
          entity.pointers.forEach((pointer) => pointersCurrentlyBeingDeployed.delete(pointer))
      }
    }
  }
}
