import { Entity, EntityId, EntityType, Pointer } from 'dcl-catalyst-commons'
import LRU from 'lru-cache'
import { EnvironmentConfig } from '../Environment'
import {
  getActiveDeploymentsByUrnPrefix,
  removeActiveDeployments,
  updateActiveDeployments
} from '../logic/database-queries/pointers-queries'
import { mapDeploymentsToEntities } from '../logic/deployments'
import { getDeployments } from '../service/deployments/deployments'
import { AppComponents } from '../types'

export type NotActiveEntity = 'NOT_ACTIVE_ENTITY'

export const isEntityPresent = (result: Entity | NotActiveEntity | undefined): result is Entity =>
  result !== undefined && result !== 'NOT_ACTIVE_ENTITY'
export const isPointingToEntity = (result: EntityId | NotActiveEntity | undefined): result is EntityId =>
  result !== undefined && result !== 'NOT_ACTIVE_ENTITY'

export type ActiveEntities = {
  /**
   * Retrieve active entities that are pointed by the given pointers
   * Note: result is cached, even if the pointer has no active entity
   */
  withPointers(pointers: Pointer[]): Promise<Entity[]>
  /**
   * Retrieve active entities which their pointers match the given urn prefix
   */
  withPrefix(urnPrefix: string): Promise<{ pointer: Pointer; entityId: EntityId }[]>
  /**
   * Retrieve active entities by their ids
   * Note: result is cached, even if the id has no active entity
   */
  withIds(entityIds: EntityId[]): Promise<Entity[]>
  /**
   * Save entityId for given pointer and store the entity in the cache,
   * useful to retrieve entities by pointers
   */
  update(pointers: Pointer[], entity: Entity | NotActiveEntity): void
  /**
   * Set pointers and entity as NOT_ACTIVE
   */
  clear(pointers: Pointer[]): void
  /**
   * Returns the cached result:
   *  - entity id if there is an active entity
   *  - NONE if there is no active entity
   *  - undefined if there is no cached result
   * Note: testing purposes
   */
  getCachedEntity(idOrPointer: EntityId | Pointer): EntityId | NotActiveEntity | undefined
}

/**
 * This component is in charge of:
 *  - retrieve active entities by ids or pointers
 *  - caching entities by id
 *  - keep the relation between pointers and the active entity ids
 */
export const createActiveEntitiesComponent = (
  components: Pick<AppComponents, 'database' | 'env' | 'logs' | 'metrics' | 'denylist' | 'sequentialExecutor'>
): ActiveEntities => {
  const logger = components.logs.getLogger('ActiveEntities')
  const cache = new LRU<EntityId, Entity | NotActiveEntity>({
    max: components.env.getConfig(EnvironmentConfig.ENTITIES_CACHE_SIZE)
  })
  const entityIdByPointers = new Map<Pointer, EntityId | NotActiveEntity>()

  // init gauge metrics
  components.metrics.observe('dcl_entities_cache_storage_max_size', {}, cache.max)
  Object.values(EntityType).forEach((entityType) => {
    components.metrics.observe('dcl_entities_cache_storage_size', { entity_type: entityType }, 0)
  })

  const reportCacheAccess = (entityType: EntityType, result: 'hit' | 'miss') => {
    components.metrics.increment('dcl_entities_cache_accesses_total', {
      entity_type: entityType,
      result
    })
  }

  const setPreviousEntityAsNone = (pointer: Pointer): void => {
    if (entityIdByPointers.has(pointer)) {
      // pointer now have a different active entity, let's update the old one
      const entityId = entityIdByPointers.get(pointer)
      if (isPointingToEntity(entityId)) {
        const entity = cache.get(entityId) // it should be present
        if (isEntityPresent(entity)) {
          cache.set(entityId, 'NOT_ACTIVE_ENTITY')
          for (const pointer of entity.pointers) {
            entityIdByPointers.set(pointer, 'NOT_ACTIVE_ENTITY')
          }
        }
      }
    }
  }

  const clear = async (pointers: Pointer[]) => {
    await update(pointers, 'NOT_ACTIVE_ENTITY')
  }

  /**
   * Save entityId for given pointer and store the entity in the cache,
   * useful to retrieve entities by pointers
   */
  const update = async (pointers: Pointer[], entity: Entity | NotActiveEntity) => {
    for (const pointer of pointers) {
      setPreviousEntityAsNone(pointer)
      entityIdByPointers.set(pointer, isEntityPresent(entity) ? entity.id : entity)
    }
    if (isEntityPresent(entity)) {
      cache.set(entity.id, entity)
      components.metrics.increment('dcl_entities_cache_storage_size', { entity_type: entity.type })
      // Store in the db the new entity pointed by pointers
      await updateActiveDeployments({ database: components.database }, pointers, entity.id)
    } else {
      // Remove the row from active_pointers table
      await removeActiveDeployments({ database: components.database }, pointers)
    }
  }

  const updateCache = async (
    entities: Entity[],
    { pointers, entityIds }: { pointers?: string[]; entityIds?: string[] }
  ): Promise<void> => {
    // Update cache for each entity
    for (const entity of entities) {
      await update(entity.pointers, entity)
    }
    // Check which pointers or ids doesn't have an active entity and set as NONE
    if (pointers) {
      const pointersWithoutActiveEntity = pointers.filter(
        (pointer) => !entities.some((entity) => entity.pointers.includes(pointer))
      )

      for (const pointer of pointersWithoutActiveEntity) {
        entityIdByPointers.set(pointer, 'NOT_ACTIVE_ENTITY')
        logger.debug('pointer has no active entity', { pointer })
      }
    } else if (entityIds) {
      const entityIdsWithoutActiveEntity = entityIds.filter(
        (entityId) => !entities.some((entity) => entity.id === entityId)
      )

      for (const entityId of entityIdsWithoutActiveEntity) {
        cache.set(entityId, 'NOT_ACTIVE_ENTITY')
        logger.debug('entityId has no active entity', { entityId })
      }
    }
  }

  /**
   * Queries DB to retrieve deployments using the given ids/pointers as filter and return them as entities.
   * It also updates the cache and reports miss access
   */
  const findEntities = async ({
    entityIds,
    pointers
  }: {
    entityIds?: EntityId[]
    pointers?: Pointer[]
  }): Promise<Entity[]> => {
    const filters = entityIds ? { entityIds } : { pointers }
    const { deployments } = await getDeployments(components, {
      filters: { ...filters, onlyCurrentlyPointed: true }
    })
    for (const deployment of deployments) {
      reportCacheAccess(deployment.entityType, 'miss')
    }

    const entities = mapDeploymentsToEntities(deployments)
    await updateCache(entities, { pointers, entityIds })

    return entities
  }

  /**
   * Retrieve active entities by their ids
   */
  const withIds = async (entityIds: EntityId[]): Promise<Entity[]> => {
    // check what is on the cache
    const uniqueEntityIds = new Set(entityIds)
    const onCache: (Entity | NotActiveEntity)[] = []
    const remaining: EntityId[] = []
    for (const entityId of uniqueEntityIds) {
      const entity = cache.get(entityId)
      if (entity) {
        onCache.push(entity)
        if (isEntityPresent(entity)) {
          reportCacheAccess(entity.type, 'hit')
        }
      } else {
        logger.debug('Entity not found on cache', { entityId })
        remaining.push(entityId)
      }
    }

    // calculate values for those remaining keys
    const remainingEntities: Entity[] = remaining.length > 0 ? await findEntities({ entityIds: remaining }) : []

    return [...onCache.filter(isEntityPresent), ...remainingEntities]
  }

  /**
   * Retrieve active entities that are pointed by the given pointers
   */
  const withPointers = async (pointers: Pointer[]) => {
    const uniquePointers = new Set(pointers)
    const uniqueEntityIds = new Set<EntityId>() // entityIds that are associated to the given pointers
    const remaining: Pointer[] = [] // pointers that are not associated to any entity

    // get associated entity ids to pointers or save for later
    for (const pointer of uniquePointers) {
      const entityId = entityIdByPointers.get(pointer)
      if (!entityId) {
        logger.debug('Entity with given pointer not found on cache', { pointer })
        remaining.push(pointer)
      } else {
        if (isPointingToEntity(entityId)) {
          uniqueEntityIds.add(entityId)
        } else {
          // logger.debug('Entity with given pointer is not active', { pointer })
        }
      }
    }

    // once we get the ids, retrieve from cache or find
    const entityIds = Array.from(uniqueEntityIds.values())
    const entitiesById = await withIds(entityIds)

    // find entities for remaining pointers (we don't know the entity id), it easier to find entire entity instead of ids
    const remainingEntities = remaining.length > 0 ? await findEntities({ pointers: remaining }) : []

    return [...entitiesById, ...remainingEntities]
  }

  /**
   * Retrieve active entities that are pointed by pointers that match the urn prefix
   */
  const withPrefix = async (urnPrefix: string) => {
    return await getActiveDeploymentsByUrnPrefix({ database: components.database }, urnPrefix)
  }

  return {
    withIds,
    withPointers,
    withPrefix,
    update,
    clear,

    getCachedEntity: (idOrPointer) => {
      if (cache.has(idOrPointer)) {
        const cachedEntity = cache.get(idOrPointer)
        return isEntityPresent(cachedEntity) ? cachedEntity.id : cachedEntity
      }
      return entityIdByPointers.get(idOrPointer)
    }
  }
}
