import { Deployment, Entity, EntityId, Pointer } from 'dcl-catalyst-commons'
import LRU from 'lru-cache'
import { EnvironmentConfig } from '../Environment'
import { getDeployments } from '../service/deployments/deployments'
import { AppComponents } from '../types'

export type ActiveEntities = {
  withPointers(...pointers: Pointer[]): Promise<Entity[]>
  withIds(...entityIds: EntityId[]): Promise<Entity[]>
  inactivate(...pointers: Pointer[]): void
  activate(pointer: Pointer, entity: Entity): void
}

const mapDeploymentsToEntities = (deployments: Deployment[]): Entity[] => {
  return deployments.map(({ entityVersion, entityId, entityType, pointers, entityTimestamp, content, metadata }) => ({
    version: entityVersion,
    id: entityId,
    type: entityType,
    pointers,
    timestamp: entityTimestamp,
    content: content?.map(({ key, hash }) => ({ file: key, hash })),
    metadata
  }))
}

export const createActiveEntitiesComponent = (
  components: Pick<AppComponents, 'database' | 'env' | 'logs' | 'metrics'>
): ActiveEntities => {
  const logger = components.logs.getLogger('ActiveEntities')
  const cache = new LRU<EntityId, Entity>({
    max: components.env.getConfig(EnvironmentConfig.ENTITIES_CACHE_SIZE)
  })
  const entityIdByPointers = new Map<Pointer, EntityId>()

  const reportCacheAccess = (entity: Entity, result: 'hit' | 'miss') => {
    components.metrics.increment('dcl_entities_cache_accesses_total', {
      entity_type: entity.type,
      result: result
    })
  }

  const cacheEntity = (entity: Entity): void => {
    cache.set(entity.id, entity)
  }

  const invalidateEntity = (entityId: EntityId): void => {
    const entity = cache.get(entityId)
    if (entity) {
      for (const pointer of entity.pointers) {
        entityIdByPointers.delete(pointer)
      }
    }
    cache.del(entityId)
  }

  const updateCacheAndReturnAsEntities = (deployments: Deployment[]): Entity[] => {
    const entities = mapDeploymentsToEntities(deployments)
    // Save the calculated values
    for (const entity of entities) {
      cacheEntity(entity)
      for (const pointer of entity.pointers) {
        entityIdByPointers.set(pointer, entity.id)
      }
    }
    return entities
  }

  /**
   * Queries DB to retrieve deployments using the given ids as filter and return them as entities
   * It also updates the cache
   */
  const findEntitiesByIds = async (entityIds: EntityId[]): Promise<Entity[]> => {
    const { deployments } = await getDeployments(components, {
      filters: { entityIds, onlyCurrentlyPointed: true }
    })
    return updateCacheAndReturnAsEntities(deployments)
  }

  /**
   * Queries DB to retrieve deployments using the given pointers as filter and return them as entities
   * It also updates the cache
   */
  const findEntitiesByPointers = async (pointers: Pointer[]): Promise<Entity[]> => {
    const { deployments } = await getDeployments(components, {
      filters: { pointers, onlyCurrentlyPointed: true }
    })
    for (const deployment of deployments) {
      deployment.pointers.forEach((pointer) => entityIdByPointers.set(pointer, deployment.entityId))
    }
    return updateCacheAndReturnAsEntities(deployments)
  }

  const withIds = async (...entityIds: EntityId[]): Promise<Entity[]> => {
    // check what is on the cache
    const uniqueEntityIds = new Set(entityIds)
    const onCache: Entity[] = []
    const missing: EntityId[] = []
    for (const entityId of uniqueEntityIds) {
      const entity = cache.get(entityId)
      if (entity) {
        onCache.push(entity)
        reportCacheAccess(entity, 'hit')
      } else {
        logger.debug('Entity not found on cache', { entityId })
        missing.push(entityId)
      }
    }

    // calculate values for those missing keys
    const calculated: Entity[] = missing.length > 0 ? await findEntitiesByIds(missing) : []

    // report miss access
    for (const entity of calculated) {
      reportCacheAccess(entity, 'miss')
    }

    return [...onCache, ...calculated]
  }

  return {
    /**
     * Retrieve active entities by their ids
     */
    withIds,
    /**
     * Retrieve active entities that are pointed by the given pointers
     */
    withPointers: async (...pointers) => {
      const uniquePointers = new Set(pointers)
      const uniqueEntityIds = new Set<EntityId>() // entityIds that are associated to the given pointers
      const missing: Pointer[] = [] // pointers that are not associated to any entity

      // get associated entity ids to pointers
      for (const pointer of uniquePointers) {
        const entityId = entityIdByPointers.get(pointer)
        if (!entityId) {
          logger.debug('Entity with given pointer not found on cache', { pointer })
          missing.push(pointer)
        } else {
          uniqueEntityIds.add(entityId)
        }
      }
      const entityIds = Array.from(uniqueEntityIds.values())

      // find entities for missing pointers, probably not necessary
      const missingEntities = missing.length > 0 ? await findEntitiesByPointers(missing) : []

      // report miss access
      for (const entity of missingEntities) {
        reportCacheAccess(entity, 'miss')
      }

      return [...(await withIds(...entityIds)), ...missingEntities]
    },

    /**
     * Invalidate the cache for the given pointers
     */
    inactivate: (...pointers) => {
      for (const pointer of pointers) {
        const entityId = entityIdByPointers.get(pointer)
        if (entityId) {
          invalidateEntity(entityId)
        }
      }
    },
    /**
     * Save entityId for given pointer, useful to retrieve entities by pointers
     */
    activate: (pointer, entity) => {
      entityIdByPointers.set(pointer, entity.id)
      cacheEntity(entity)
    }
  }
}
