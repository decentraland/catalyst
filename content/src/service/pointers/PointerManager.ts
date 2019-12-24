import Cache from "caching-map"
import { EntityType, Pointer, EntityId, Entity } from "../Entity";
import { Timestamp } from "../Service";
import { PointerStorage } from "./PointerStorage";

/**
 * When syncing with other nodes, we might not get all references in order. In order to make sure that
 * our content remains consistent, regardless of when we found out about references, we need to preserve some history
 * about pointers. This means that when an entity is overwritten, we will still preserve the entity's data, until we are sure that
 * no older entities can be deployed.
 */
export class PointerManager {

    private pointers: Map<EntityType, Cache> = new Map()
    constructor(private storage: PointerStorage) {
        // Register type on global map. This way, we don't have to check on each reference
        Object.values(EntityType)
            .forEach((entityType: EntityType) => {
                let cache = new Cache(50)
                cache.materialize = (pointer: Pointer) => this.getPointerFromDisk(pointer, entityType)
                this.pointers.set(entityType, cache)
            })
    }

    /** Return the entity id of the entity, only if it is active */
    async getEntityInPointer(type: EntityType, pointer: Pointer): Promise<EntityId | undefined> {
        const entityReference: EntityReference | undefined = await this.pointers.get(type)?.get(pointer)
        return entityReference?.active ? entityReference.entityId : undefined
    }

    /** Return all active pointers */
    getActivePointers(type: EntityType): Promise<Pointer[]> {
        return this.storage.getReferences(type)
    }

    /**
     * Try to commit a new entity. It might happen that the entity is not commited, since a newer entity might already be using the same pointers.
     * Even if the entity can't commit, its deployment might have some side effects, such as deleting other entities.
     */
    async tryToCommitPointers(entity: Entity): Promise<CommitResult> {
        let cache = this.pointers.get(entity.type) as Cache
        let canCommit: boolean = true
        let pointersToOverwrite: Pointer[] = []
        let entitiesToDelete: EntityReference[] = []

        for (const pointer of entity.pointers) {
            const entityReferenceOnPointer: EntityReference | undefined = await cache.get(pointer)

            // Check if pointer has a reference on it
            if (entityReferenceOnPointer) {
                if(this.isEntityNewerThan(entity, entityReferenceOnPointer)) {
                    // If the new entity is newer, then we will overwrite the pointer
                    pointersToOverwrite.push(pointer)
                    if (entityReferenceOnPointer.active) {
                        // If the reference is active, then the entity needs to be deleted
                        entitiesToDelete.push(entityReferenceOnPointer)
                    }
                } else {
                    // If the reference is newer, then we can't commit
                    canCommit = false
                }
            } else {
                // If nothing is set, then we want to write the new entity to it
                pointersToOverwrite.push(pointer)
            }
        }

        // Set all entities that need to be deleted to inactive. We don't delete them here, because we
        // might need to reject an entity that is older, but arrives later
        const deletedEntitiesActions = entitiesToDelete.map(entityReference => this.setReferenceToInactive(entityReference))
            .map(entityReference => this.storeReferenceInPointers(entityReference, entityReference.pointers, entity.type))

        // Delete from the cache all pointers that belong to the entities we set to inactive
        entitiesToDelete.map(entityToDelete => entityToDelete.pointers)
            .reduce((accum, currentValue) => accum.concat(currentValue), [])
            .forEach(pointer => cache.delete(pointer))

        // Overwrite all pointers
        const reference = this.buildReference(entity, canCommit)
        const pointersStorageActions = this.storeReferenceInPointers(reference, pointersToOverwrite, entity.type)
        pointersToOverwrite.forEach(pointer => cache.delete(pointer))

        await Promise.all(deletedEntitiesActions)
        await pointersStorageActions

        return {
            entitiesDeleted: entitiesToDelete.map(entityReference => entityReference.entityId),
            couldCommit: canCommit,
        }
    }

    private storeReferenceInPointers(entityReference: EntityReference, pointers: Pointer[], entityType: EntityType): Promise<void[]> {
        return Promise.all(pointers.map(pointer => this.storage.setReference(pointer, entityType, entityReference)));
    }

    /** When we have a new immutable time, we can get rid of all the inactive references that happened before */
    setImmutableTime(immutableTime: Timestamp) {
        // TODO
    }

    private getPointerFromDisk(pointer: Pointer, type: EntityType): Promise<EntityReference | undefined> {
        try {
            return this.storage.getReference(pointer, type)
        } catch (e) {
            return Promise.resolve(undefined)
        }
    }

    private buildReference(entity: Entity, canCommit: boolean): EntityReference {
        const { id, pointers, timestamp } = entity
        return {
            entityId: id,
            pointers,
            timestamp,
            active: canCommit
        }
    }

    private setReferenceToInactive(entityReference: EntityReference): EntityReference {
        const { entityId, pointers, timestamp } = entityReference
        return {
            entityId,
            pointers,
            timestamp,
            active: false
        }
    }

    private isEntityNewerThan(entity: Entity, entityReference: EntityReference) {
        return entity.timestamp > entityReference.timestamp ||
            (entity.timestamp == entityReference.timestamp && entity.id > entityReference.entityId)
    }

}

export type CommitResult = {
    entitiesDeleted: EntityId[],
    couldCommit: boolean
}

export type EntityReference = {
    entityId: EntityId,
    pointers: Pointer[],
    timestamp: Timestamp,
    active: boolean,
}