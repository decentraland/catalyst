import { Deployment, Entity, EntityId, EntityType, Pointer } from 'dcl-catalyst-commons'
import LRU from 'lru-cache'
import { EnvironmentConfig } from '../Environment'
import { mapDeploymentsToEntities } from '../logic/deployments'
import { getDeployments } from '../service/deployments/deployments'
import { AppComponents } from '../types'

export type ActiveEntities = {
  /**
   * Retrieve active entities that are pointed by the given pointers
   */
  withPointers(pointers: Pointer[]): Promise<Entity[]>
  /**
   * Retrieve active entities by their ids
   */
  withIds(entityIds: EntityId[]): Promise<Entity[]>
  /**
   * Invalidate the cache for the given pointers
   */
  invalidate(pointers: Pointer[]): void
  /**
   * Save entityId for given pointer and store the entity in the cache,
   * useful to retrieve entities by pointers
   */
  update(pointers: Pointer[], entity: Entity): void
  /**
   * Returns the entity id if there is an active entity with given pointer
   * Note: testing purposes
   */
  getActiveEntity(pointer: Pointer): EntityId | undefined
  /**
   * Returns true if there is an active entity cached with given id
   * Note: testing purposes
   */
  isActiveEntityCached(entityId: EntityId): boolean
}

/**
 * This component is in charge of:
 *  - retrieve active entities by ids or pointers
 *  - caching entities by id
 *  - keep the relation between pointers and the active entity ids
 */
export const createActiveEntitiesComponent = (
  components: Pick<AppComponents, 'database' | 'env' | 'logs' | 'metrics'>
): ActiveEntities => {
  const logger = components.logs.getLogger('ActiveEntities')
  const cache = new LRU<EntityId, Entity>({
    max: components.env.getConfig(EnvironmentConfig.ENTITIES_CACHE_SIZE)
  })
  const entityIdByPointers = new Map<Pointer, EntityId>()

  const reportCacheAccess = (entityType: EntityType, result: 'hit' | 'miss') => {
    components.metrics.increment('dcl_entities_cache_accesses_total', {
      entity_type: entityType,
      result
    })
  }

  const invalidateEntity = (entityId: EntityId): void => {
    const entity = cache.get(entityId)
    if (entity) {
      for (const pointer of entity.pointers) {
        entityIdByPointers.delete(pointer)
      }
      cache.del(entityId)
    }
  }

  /**
   * Invalidate the cache for the given pointers
   */
  const invalidate = (pointers: string[]): void => {
    for (const pointer of pointers) {
      const entityId = entityIdByPointers.get(pointer)
      if (entityId) {
        invalidateEntity(entityId)
      }
    }
  }

  /**
   * Save entityId for given pointer and store the entity in the cache,
   * useful to retrieve entities by pointers
   */
  const update = (pointers: Pointer[], entity: Entity) => {
    invalidate(pointers)
    for (const pointer of pointers) {
      entityIdByPointers.set(pointer, entity.id)
    }
    cache.set(entity.id, entity)
  }

  const updateCacheAndReturnAsEntities = (deployments: Deployment[]): Entity[] => {
    const entities = mapDeploymentsToEntities(deployments)
    // Update cache for each entity
    for (const entity of entities) {
      update(entity.pointers, entity)
    }
    return entities
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
    return updateCacheAndReturnAsEntities(deployments)
  }

  /**
   * Retrieve active entities by their ids
   */
  const withIds = async (entityIds: EntityId[]): Promise<Entity[]> => {
    // check what is on the cache
    const uniqueEntityIds = new Set(entityIds)
    const onCache: Entity[] = []
    const remaining: EntityId[] = []
    for (const entityId of uniqueEntityIds) {
      const entity = cache.get(entityId)
      if (entity) {
        onCache.push(entity)
        reportCacheAccess(entity.type, 'hit')
      } else {
        logger.debug('Entity not found on cache', { entityId })
        remaining.push(entityId)
      }
    }

    // calculate values for those remaining keys
    const remainingEntities: Entity[] = remaining.length > 0 ? await findEntities({ entityIds: remaining }) : []

    if (onCache.length + remainingEntities.length !== entityIds.length) {
      const missingIds = entityIds
        .filter((entityId) => {
          const notInCache = !onCache.find((entity) => entity.id === entityId)
          const notInRemaining = !remainingEntities.find((entity) => entity.id === entityId)
          return notInCache && notInRemaining
        })
        .join(', ')
      logger.debug('Some requested entities are not active or do not exist', { missingIds })
    }

    return [...onCache, ...remainingEntities]
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
        uniqueEntityIds.add(entityId)
      }
    }

    // once we get the ids, retrieve from cache or find
    const entityIds = Array.from(uniqueEntityIds.values())
    const entitiesById = await withIds(entityIds)

    // find entities for remaining pointers (we don't know the entity id), it easier to find entire entity instead of ids
    const remainingEntities = remaining.length > 0 ? await findEntities({ pointers: remaining }) : []

    return [...entitiesById, ...remainingEntities]
  }

  return {
    withIds,
    withPointers,
    update,
    invalidate,

    getActiveEntity: (pointer) => entityIdByPointers.get(pointer),
    isActiveEntityCached: (entityId) => cache.has(entityId)
  }
}
