import { Entity } from '@dcl/schemas'
import { IBaseComponent } from '@well-known-components/interfaces'
import { DatabaseClient } from '../../ports/postgres'

export const BASE_AVATARS_COLLECTION_ID = 'urn:decentraland:off-chain:base-avatars'
export const BASE_EMOTES_COLLECTION_ID = 'urn:decentraland:off-chain:base-emotes'

export type NotActiveEntity = 'NOT_ACTIVE_ENTITY'

export type ActiveEntities = IBaseComponent & {
  /**
   * Retrieve active entities that are pointed by the given pointers
   * Note: result is cached, even if the pointer has no active entity
   */
  withPointers(database: DatabaseClient, pointers: string[]): Promise<Entity[]>
  /**
   * Retrieve active entities which their pointers match the given urn prefix
   */
  withPrefix(collectionUrn: string, offset: number, limit: number): Promise<{ total: number; entities: Entity[] }>
  /**
   * Retrieve active entities by their ids
   * Note: result is cached, even if the id has no active entity
   */
  withIds(database: DatabaseClient, entityIds: string[]): Promise<Entity[]>
  /**
   * Save entityId for given pointer and store the entity in the cache,
   * useful to retrieve entities by pointers
   */
  update(database: DatabaseClient, pointers: string[], entity: Entity | NotActiveEntity): Promise<void>
  /**
   * Set pointers and entity as NOT_ACTIVE
   */
  clear(database: DatabaseClient, pointers: string[]): Promise<void>
  /**
   * Returns the cached result:
   *  - entity id if there is an active entity
   *  - NONE if there is no active entity
   *  - undefined if there is no cached result
   * Note: testing purposes
   */
  getCachedEntity(idOrPointer: string | string): string | NotActiveEntity | undefined
  /**
   * Reset internal state
   * Note: testing purposes
   */
  reset(): void
  /**
   * Clear pointers from active entities
   * Note: only used in stale profiles GC
   */
  clearPointers(pointers: string[]): Promise<void>
}

export const isEntityPresent = (result: Entity | NotActiveEntity | undefined): result is Entity =>
  result !== undefined && result !== 'NOT_ACTIVE_ENTITY'
export const isPointingToEntity = (result: string | NotActiveEntity | undefined): result is string =>
  result !== undefined && result !== 'NOT_ACTIVE_ENTITY'
