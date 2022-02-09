import { Deployment, Entity, EntityId, PartialDeploymentHistory, Pointer } from 'dcl-catalyst-commons'
import LRU from 'lru-cache'
import { EnvironmentConfig } from '../Environment'
import { getDeployments } from '../service/deployments/deployments'
import { AppComponents } from '../types'

export type EntityCache = {
  getByPointers(...pointers: Pointer[]): Promise<Entity[]>
  getByIds(...entityIds: EntityId[]): Promise<Entity[]>
  invalidate(...pointers: Pointer[]): void
  associate(pointer: Pointer, entityId: EntityId): void
}

const mapDeploymentsToEntities = (history: PartialDeploymentHistory<Deployment>): Entity[] => {
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

export const createEntityCache = (components: Pick<AppComponents, 'database' | 'env' | 'logs'>): EntityCache => {
  const logger = components.logs.getLogger('EntityCache')
  const cache = new LRU<EntityId, Entity>({
    max: components.env.getConfig(EnvironmentConfig.ENTITIES_CACHE_SIZE) ?? 15000
  })
  const entityIdByPointers = new Map<Pointer, EntityId>()

  const storeDeploymentsAsEntities = (deployments: PartialDeploymentHistory<Deployment>): Entity[] => {
    const entities = mapDeploymentsToEntities(deployments)
    // Save the calculated values
    for (const entity of entities) {
      cache.set(entity.id, entity)
    }
    return entities
  }

  const findEntitiesByIds = async (entityIds: EntityId[]): Promise<Entity[]> => {
    const deployments = await getDeployments(components, {
      filters: { entityIds, onlyCurrentlyPointed: true }
    })
    return storeDeploymentsAsEntities(deployments)
  }

  const findEntitiesByPointers = async (pointers: Pointer[]): Promise<Entity[]> => {
    const deployments = await getDeployments(components, {
      filters: { pointers, onlyCurrentlyPointed: true }
    })
    for (const deployment of deployments.deployments) {
      deployment.pointers.forEach((pointer) => entityIdByPointers.set(pointer, deployment.entityId))
    }
    return storeDeploymentsAsEntities(deployments)
  }

  const getByIds = async (...entityIds: EntityId[]): Promise<Entity[]> => {
    // Check what is on the cache
    const onCache: Entity[] = []
    const missing: EntityId[] = []
    for (const entityId of entityIds) {
      const entity = cache.get(entityId)
      if (entity) {
        onCache.push(entity)
      } else {
        logger.debug('Entity not found on cache', { entityId })
        missing.push(entityId)
      }
    }

    // Calculate values for those missing keys
    const calculated: Entity[] = missing.length > 0 ? await findEntitiesByIds(missing) : []

    // Concatenate the results and return them
    return [...onCache, ...calculated]
  }

  return {
    /**
     * Get entities by their ids
     */
    getByIds,
    /**
     * Retrieve active entities that are pointed by the given pointers
     */
    getByPointers: async (...pointers) => {
      const uniqueEntityIds = new Set<EntityId>() // entityIds that are associated to the given pointers
      const missing: Pointer[] = [] // pointers that are not associated to any entity

      // get associated entity ids to pointers
      for (const pointer of pointers) {
        const entityId = entityIdByPointers.get(pointer)
        if (!entityId) {
          // this should not happen, but just in case
          logger.debug('Entity with given pointer not found on cache, this should not happen', { pointer })
          missing.push(pointer)
        } else {
          uniqueEntityIds.add(entityId)
        }
      }
      const entityIds = Array.from(uniqueEntityIds.values())

      // find entities for missing pointers, probably not necessary
      const missingEntities = missing.length > 0 ? await findEntitiesByPointers(missing) : []

      return [...(await getByIds(...entityIds)), ...missingEntities]
    },

    /**
     * Invalidate the cache for the given pointers
     */
    invalidate: (...pointers) => {
      for (const pointer of pointers) {
        const entityId = entityIdByPointers.get(pointer)
        if (entityId) {
          cache.del(entityId)
          entityIdByPointers.delete(pointer)
        }
      }
    },
    /**
     * Save entityId for given pointer, useful to retrieve entities by pointers
     */
    associate: (pointer, entityId) => {
      entityIdByPointers.set(pointer, entityId)
    }
  }
}
