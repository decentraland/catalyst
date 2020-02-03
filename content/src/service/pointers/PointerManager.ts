import { Cache } from "../caching/Cache"
import { EntityType, Pointer, EntityId, Entity } from "../Entity";
import { Timestamp } from "../time/TimeSorting";
import { PointerStorage } from "./PointerStorage";
import { AuditOverwrite } from "../audit/Audit";
import { PointerDeploymentsRecord } from "./PointerDeploymentsRecord";

/**
 * Manage all pointer data
 */
export class PointerManager {

    private readonly tempDeployments: PointerDeploymentsRecord
    private readonly pointers: Map<EntityType, Cache<Pointer, EntityId | undefined>> = new Map()
    private constructor(private storage: PointerStorage,
        private auditOverwrite: AuditOverwrite,
        tempDeploymentInfo: Buffer | undefined) {
        // Register type on global map. This way, we don't have to check on each reference
        Object.values(EntityType)
            .forEach((entityType: EntityType) => {
                const cache: Cache<Pointer, EntityId | undefined> = Cache.withCalculation((pointer: Pointer) => this.getPointerFromDisk(entityType, pointer), 1000)
                this.pointers.set(entityType, cache)
            })

        this.tempDeployments = new PointerDeploymentsRecord((type, pointer) => this.getEntityInPointer(type, pointer), tempDeploymentInfo)
    }

    static async build(storage: PointerStorage, auditOverwrite: AuditOverwrite): Promise<PointerManager> {
        const tempDeployments = await storage.readStoredTempDeployments();
        return new PointerManager(storage, auditOverwrite, tempDeployments)
    }

    /** Return all active pointers */
    getActivePointers(type: EntityType): Promise<Pointer[]> {
        return this.storage.getActivePointers(type)
    }

    /** Returns the id of the entity being referenced by the given pointer (if any) */
    getEntityInPointer(type: EntityType, pointer: Pointer): Promise<EntityId | undefined> {
        return this.getPointerMap(type).get(pointer)
    }

    setTimeAsImmutable(immutableDeploymentTimestamp: Timestamp): Promise<void> {
        this.tempDeployments.setTimeAsImmutable(immutableDeploymentTimestamp)
        return this.saveToStorage()
    }

    /**
     * Commit a new entity. This method will take care of potential synchronization problems.
     */
    async commitEntity(entityBeingDeployed: Entity, deploymentTimestamp: Timestamp, entityFetcher: (entityId: EntityId) => Promise<Entity | undefined>): Promise<void> {

        const { overwrites ,
            deletedPointers,
            overwritingEntity } = await this.tempDeployments.exerciseCommit(entityBeingDeployed, deploymentTimestamp, entityFetcher)

        // Update overwrites on audit info
        const overwriteUpdates: Promise<void>[] = Array.from(overwrites.entries())
            .map(([overwritten, overwrittenBy]) => this.auditOverwrite.setEntityAsOverwritten(overwritten, overwrittenBy))

        // Delete the pointers of all previous entities being overwritten
        const previousEntitiesDeletions = Array.from(deletedPointers.values())
            .filter(pointer => !entityBeingDeployed.pointers.includes(pointer))
            .map(pointer => this.storage.deletePointerReference(entityBeingDeployed.type, pointer, entityBeingDeployed.timestamp))

        // Also invalidate these pointers
        Array.from(deletedPointers.values()).forEach(pointer => this.invalidate(entityBeingDeployed.type, pointer))

        // Write the new deployment on the pointers' histories
        await Promise.all(entityBeingDeployed.pointers.map(pointer => this.storage.setPointerReference(entityBeingDeployed.type, pointer, entityBeingDeployed.id, entityBeingDeployed.timestamp)))

        let deletionUpdates: Promise<void>[] = []

        if (!overwritingEntity) {
            // Since the current entity will be committed, invalidate its pointers
            entityBeingDeployed.pointers.forEach(pointer => this.invalidate(entityBeingDeployed.type, pointer))
        } else {
            // Delete all the pointers of the current entity that were not directly overwritten. This way, we know those pointers were deleted when looking at the pointer files
            deletionUpdates = entityBeingDeployed.pointers
                .filter(pointer => !overwritingEntity.pointers.includes(pointer))
                .map(pointer => this.storage.deletePointerReference(entityBeingDeployed.type, pointer, overwritingEntity.timestamp));
        }

        // Wait for everything
        await Promise.all([...overwriteUpdates, ...previousEntitiesDeletions, ...deletionUpdates, this.saveToStorage()])
    }

    private saveToStorage(): Promise<void> {
        return this.storage.storeTempDeployments(this.tempDeployments.getInformationToStore());
    }

    private invalidate(type: EntityType, pointer: string): void {
        return this.getPointerMap(type).invalidate(pointer);
    }

    private getPointerMap(entityType: EntityType): Cache<Pointer, EntityId> {
        return this.pointers.get(entityType) as Cache<Pointer, EntityId>
    }

    private getPointerFromDisk(type: EntityType, pointer: Pointer): Promise<EntityId | undefined> {
        return this.storage.getPointerReference(type, pointer)
    }

}