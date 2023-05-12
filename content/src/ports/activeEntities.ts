import { Entity, EntityType } from '@dcl/schemas'
import LRU from 'lru-cache'
import { EnvironmentConfig } from '../Environment'
import {
  gerUrnsThatMatchCollectionUrnPrefix,
  removeActiveDeployments,
  updateActiveDeployments
} from '../logic/database-queries/pointers-queries'
import { getDeploymentsForActiveEntities, mapDeploymentsToEntities } from '../logic/deployments'
import { AppComponents } from '../types'

export const BASE_AVATARS_COLLECTION_ID = 'urn:decentraland:off-chain:base-avatars'

export type NotActiveEntity = 'NOT_ACTIVE_ENTITY'

export const isEntityPresent = (result: Entity | NotActiveEntity | undefined): result is Entity =>
  result !== undefined && result !== 'NOT_ACTIVE_ENTITY'
export const isPointingToEntity = (result: string | NotActiveEntity | undefined): result is string =>
  result !== undefined && result !== 'NOT_ACTIVE_ENTITY'

export type ActiveEntities = {
  /**
   * Retrieve active entities that are pointed by the given pointers
   * Note: result is cached, even if the pointer has no active entity
   */
  withPointers(pointers: string[]): Promise<Entity[]>
  /**
   * Retrieve active entities which their pointers match the given urn prefix
   */
  withPrefix(collectionUrn: string, offset: number, limit: number): Promise<{ total: number; entities: Entity[] }>
  /**
   * Retrieve active entities by their ids
   * Note: result is cached, even if the id has no active entity
   */
  withIds(entityIds: string[]): Promise<Entity[]>
  /**
   * Save entityId for given pointer and store the entity in the cache,
   * useful to retrieve entities by pointers
   */
  update(pointers: string[], entity: Entity | NotActiveEntity, database?: AppComponents['database']): Promise<void>
  /**
   * Set pointers and entity as NOT_ACTIVE
   */
  clear(pointers: string[]): Promise<void>
  /**
   * Returns the cached result:
   *  - entity id if there is an active entity
   *  - NONE if there is no active entity
   *  - undefined if there is no cached result
   * Note: testing purposes
   */
  getCachedEntity(idOrPointer: string | string): string | NotActiveEntity | undefined
}

/**
 * This component is in charge of:
 *  - retrieve active entities by ids or pointers
 *  - caching entities by id
 *  - keep the relation between pointers and the active entity ids
 */
export function createActiveEntitiesComponent(
  components: Pick<AppComponents, 'database' | 'env' | 'logs' | 'metrics' | 'denylist' | 'sequentialExecutor'>
): ActiveEntities {
  const logger = components.logs.getLogger('ActiveEntities')
  const cache = new LRU<string, Entity | NotActiveEntity>({
    max: components.env.getConfig(EnvironmentConfig.ENTITIES_CACHE_SIZE)
  })

  const collectionUrnsByPrefixCache = new LRU<string, string[]>({
    ttl: 1000 * 60 * 60 * 24, // 24 hours
    fetchMethod: async (collectionUrn: string) =>
      gerUrnsThatMatchCollectionUrnPrefix({ database: components.database }, collectionUrn.toLowerCase())
  })

  const normalizePointerCacheKey = (pointer: string) => pointer.toLowerCase()

  const createEntityByPointersCache = (): Map<string, string | NotActiveEntity> => {
    const entityIdByPointers = new Map<string, string | NotActiveEntity>()
    return {
      ...entityIdByPointers,
      get(pointer: string) {
        return entityIdByPointers.get(normalizePointerCacheKey(pointer))
      },
      set(pointer: string, entity: string | NotActiveEntity) {
        return entityIdByPointers.set(normalizePointerCacheKey(pointer), entity)
      },
      has(pointer: string) {
        return entityIdByPointers.has(normalizePointerCacheKey(pointer))
      }
    }
  }

  const entityIdByPointers = createEntityByPointersCache()

  // init gauge metrics
  components.metrics.observe('dcl_entities_cache_storage_max_size', {}, cache.max)
  Object.values(EntityType).forEach((entityType) => {
    components.metrics.observe('dcl_entities_cache_storage_size', { entity_type: entityType }, 0)
  })

  function reportCacheAccess(entityType: EntityType, result: 'hit' | 'miss') {
    components.metrics.increment('dcl_entities_cache_accesses_total', {
      entity_type: entityType,
      result
    })
  }

  function setPreviousEntityAsNone(pointer: string): void {
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

  async function clear(pointers: string[]) {
    await update(pointers, 'NOT_ACTIVE_ENTITY')
  }

  /**
   * Save entityId for given pointer and store the entity in the cache,
   * useful to retrieve entities by pointers
   */
  async function update(
    pointers: string[],
    entity: Entity | NotActiveEntity,

    databaseClient?: AppComponents['database']
  ): Promise<void> {
    for (const pointer of pointers) {
      setPreviousEntityAsNone(pointer)
      entityIdByPointers.set(pointer, isEntityPresent(entity) ? entity.id : entity)
    }
    if (isEntityPresent(entity)) {
      cache.set(entity.id, entity)
      components.metrics.increment('dcl_entities_cache_storage_size', { entity_type: entity.type })
      // Store in the db the new entity pointed by pointers
      await updateActiveDeployments({ database: databaseClient ?? components.database }, pointers, entity.id)
    } else {
      // Remove the row from active_pointers table
      await removeActiveDeployments({ database: databaseClient ?? components.database }, pointers)
    }
  }

  async function updateCache(
    entities: Entity[],
    { pointers, entityIds }: { pointers?: string[]; entityIds?: string[] }
  ): Promise<void> {
    // Update cache for each entity
    for (const entity of entities) {
      await update(entity.pointers, entity)
    }
    // Check which pointers or ids doesn't have an active entity and set as NONE
    if (pointers) {
      const pointersWithoutActiveEntity = pointers.filter(
        (pointer) =>
          !entities.some((entity) =>
            entity.pointers.map(normalizePointerCacheKey).includes(normalizePointerCacheKey(pointer))
          )
      )

      for (const pointer of pointersWithoutActiveEntity) {
        entityIdByPointers.set(pointer, 'NOT_ACTIVE_ENTITY')
      }
    } else if (entityIds) {
      const entityIdsWithoutActiveEntity = entityIds.filter(
        (entityId) => !entities.some((entity) => entity.id === entityId)
      )

      for (const entityId of entityIdsWithoutActiveEntity) {
        cache.set(entityId, 'NOT_ACTIVE_ENTITY')
      }
    }
  }

  /**
   * Queries DB to retrieve deployments using the given ids/pointers as filter and return them as entities.
   * It also updates the cache and reports miss access
   */
  async function findEntities({
    entityIds,
    pointers
  }: {
    entityIds?: string[]
    pointers?: string[]
  }): Promise<Entity[]> {
    const deployments = await getDeploymentsForActiveEntities(components, entityIds, pointers)
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
  async function withIds(entityIds: string[]): Promise<Entity[]> {
    // check what is on the cache
    const uniqueEntityIds = new Set(entityIds)
    const onCache: (Entity | NotActiveEntity)[] = []
    const remaining: string[] = []
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
  async function withPointers(pointers: string[]) {
    const uniquePointers = new Set(pointers)
    const uniqueEntityIds = new Set<string>() // entityIds that are associated to the given pointers
    const remaining: string[] = [] // pointers that are not associated to any entity

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
  async function withPrefix(
    collectionUrn: string,
    offset: number,
    limit: number
  ): Promise<{ total: number; entities: Entity[] }> {
    const urns = await collectionUrnsByPrefixCache.fetch(collectionUrn)
    if (!urns) {
      throw new Error(`error fetching urns for collection: ${collectionUrn}`)
    }
    const total = urns.length
    const entities = await withPointers(urns.slice(offset, offset + limit))
    return {
      total,
      entities
    }
  }

  return {
    withIds,
    withPointers,
    withPrefix,
    update,
    clear,

    getCachedEntity(idOrPointer) {
      if (cache.has(idOrPointer)) {
        const cachedEntity = cache.get(idOrPointer)
        return isEntityPresent(cachedEntity) ? cachedEntity.id : cachedEntity
      }
      return entityIdByPointers.get(idOrPointer)
    }
  }
}
