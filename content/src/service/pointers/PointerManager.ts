import { Cache } from "../caching/Cache"
import { EntityType, Pointer, EntityId, Entity } from "../Entity";
import { Timestamp, happenedBefore } from "../time/TimeSorting";
import { PointerStorage } from "./PointerStorage";
import { AuditOverwrite } from "../audit/Audit";

/**
 * Manage all pointer data
 */
export class PointerManager {

    static readonly DELETED: string = "deleted"
    private readonly pointers: Map<EntityType, Cache<Pointer, EntityId | undefined>> = new Map()
    constructor(private readonly storage: PointerStorage,
        private readonly auditOverwrite: AuditOverwrite) {
        // Register type on global map. This way, we don't have to check on each reference
        Object.values(EntityType)
            .forEach((entityType: EntityType) => {
                const cache: Cache<Pointer, EntityId | undefined> = Cache.withCalculation((pointer: Pointer) => this.getPointerFromDisk(entityType, pointer), 1000)
                this.pointers.set(entityType, cache)
            })
    }

    /** Return all active pointers */
    async getActivePointers(type: EntityType): Promise<Pointer[]> {
        const pointers: Pointer[] = await this.storage.getPointersAllFiles(type)
        const entityInPointer = await Promise.all(pointers.map(async pointer => [pointer, await this.getEntityInPointer(type, pointer)] as [Pointer, EntityId | undefined]))
        return entityInPointer.filter(([, entity]) => !!entity)
            .map(([pointer]) => pointer)
    }

    /** Returns the id of the entity being referenced by the given pointer (if any) */
    getEntityInPointer(type: EntityType, pointer: Pointer): Promise<EntityId | undefined> {
        return this.getPointerMap(type).get(pointer)
    }

    /**
     * Commit a new entity. This method will take care of potential synchronization problems.
     */
    async commitEntity(entityBeingDeployed: Entity, entityFetcher: (entityId: EntityId) => Promise<Entity | undefined>): Promise<void> {

        // Retrieve the references for each pointer
        const references: Map<Pointer, PointerReference[]> = new Map(await Promise.all(entityBeingDeployed.pointers.map(async pointer => [pointer, await this.storage.getPointerReferences(entityBeingDeployed.type, pointer)] as [Pointer, PointerReference[]])))

        // Insert the new reference into the array, and retrieve the index where is was placed
        const positionInArray: Map<Pointer, number> = new Map()
        for (const [pointer, array] of references.entries()) {
            const index = this.addEntityToArray(entityBeingDeployed, array)
            positionInArray.set(pointer, index)
        }

        // Search for overwritten entities
        const overwrittenByNewDeployment: Set<EntityId> = new Set()
        for (const [pointer, index] of positionInArray.entries()) {
            if (index > 0) {
                const array: PointerReference[] = references.get(pointer) as PointerReference[]
                const overwritten: PointerReference = array[index - 1]
                if (overwritten.entityId !== PointerManager.DELETED) {
                    overwrittenByNewDeployment.add(overwritten.entityId)
                }
            }
        }

        // Fetch entities being overwritten
        const overwrittenEntities: (Entity | undefined)[] = await Promise.all(Array.from(overwrittenByNewDeployment.values())
            .map(entityId => entityFetcher(entityId)))

        // Combine all pointers
        const overwrittenEntitiesPointers: Pointer[] = overwrittenEntities.filter((entity): entity is Entity => !!entity)
            .map(entity => entity.pointers)
            .reduce((pointers1, pointers2) => pointers1.concat(pointers2), [])
            .filter(pointer => !entityBeingDeployed.pointers.includes(pointer))

        // Retrieve new pointer arrays
        for (const pointer of overwrittenEntitiesPointers) {
            const array = await this.storage.getPointerReferences(entityBeingDeployed.type, pointer)
            references.set(pointer, array)
        }

        // Mark as deleted the pointers that were not directly overwritten by the new deployment
        const deletedByNewDeployment: PointerReference = { entityId: PointerManager.DELETED, timestamp: entityBeingDeployed.timestamp }
        overwrittenEntitiesPointers
            .forEach(pointer => {
                this.invalidate(entityBeingDeployed.type, pointer)
                this.addToArray(deletedByNewDeployment, references.get(pointer) as PointerReference[])
            })

        // Remove all deletions right after the new entity deployment. We will recalculate those later
        for (const [pointer, index] of positionInArray.entries()) {
            const array: PointerReference[] = references.get(pointer) as PointerReference[]
            if (index < array.length - 1) {
                const next: PointerReference = array[index + 1]
                if (next.entityId === PointerManager.DELETED) {
                    array.splice(index + 1, 1)
                }
            }
        }

        // Check if there is an entity that overwrites the current deployment
        let overwriting: PointerReference | undefined
        let pointersWhereItWasOverwritten: Set<Pointer> = new Set()
        for (const [pointer, index] of positionInArray.entries()) {
            const array: PointerReference[] = references.get(pointer) as PointerReference[]
            if (index < array.length - 1) {
                const next: PointerReference = array[index + 1]
                if (!overwriting || happenedBefore(next, overwriting)) {
                    overwriting = next
                    pointersWhereItWasOverwritten = new Set([pointer])
                } else if (overwriting.entityId === next.entityId) {
                    pointersWhereItWasOverwritten.add(pointer)
                }
            }
        }

        // If the entity being deployed was overwritten, then mark the current entity deployment as deleted
        if (overwriting) {
            const deletedByAnotherDeployment: PointerReference = { entityId: PointerManager.DELETED, timestamp: overwriting.timestamp }
            entityBeingDeployed.pointers.filter(pointer => !pointersWhereItWasOverwritten.has(pointer))
                .forEach(pointer => this.addToArray(deletedByAnotherDeployment, references.get(pointer) as PointerReference[]))
        }

        // Mark overwritten entities on the audit info
        const auditInfoUpdates = Array.from(overwrittenByNewDeployment.values())
            .map(overwritten => this.auditOverwrite.setEntityAsOverwritten(overwritten, entityBeingDeployed.id))

        if (overwriting) {
            auditInfoUpdates.push(this.auditOverwrite.setEntityAsOverwritten(entityBeingDeployed.id, overwriting.entityId))
        }

        // Store all changes back
        const storageUpdates = Array.from(references.entries())
            .map(([pointer, array]) => this.storage.setPointerReferences(entityBeingDeployed.type, pointer, array))

        // Invalidate all pointers
        entityBeingDeployed.pointers.forEach(pointer => this.invalidate(entityBeingDeployed.type, pointer))

        // Wait for everything
        await Promise.all([...auditInfoUpdates, ...storageUpdates])
    }

    private addEntityToArray(entityBeingDeployed: Entity, references: PointerReference[]): number {
        const newReference = {entityId: entityBeingDeployed.id, timestamp: entityBeingDeployed.timestamp}
        return this.addToArray(newReference, references)
    }

    private addToArray(newReference: PointerReference, references: PointerReference[]): number {
        let i = references.length - 1
        while (i >= 0 && !happenedBefore(references[i], newReference)) {
            i--;
        }
        references.splice(i + 1, 0, newReference)
        return i + 1
    }

    private invalidate(type: EntityType, pointer: string): void {
        return this.getPointerMap(type).invalidate(pointer);
    }

    private getPointerMap(entityType: EntityType): Cache<Pointer, EntityId> {
        return this.pointers.get(entityType) as Cache<Pointer, EntityId>
    }

    private async getPointerFromDisk(type: EntityType, pointer: Pointer): Promise<EntityId | undefined> {
        const references = await this.storage.getPointerReferences(type, pointer);
        const reference: PointerReference | undefined = references[references.length - 1];
        if (reference && reference.entityId !== PointerManager.DELETED) {
            return reference.entityId
        }
    }

}

export type PointerReference = {
    entityId: EntityId,
    timestamp: Timestamp,
}