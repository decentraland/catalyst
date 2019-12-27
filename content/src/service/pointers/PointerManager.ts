import { Cache } from "../caching/Cache"
import { EntityType, Pointer, EntityId, Entity } from "../Entity";
import { Timestamp } from "../Service";
import { PointerStorage } from "./PointerStorage";
import { AuditOverwrite } from "../audit/Audit";

/**
 * When syncing with other nodes, we might not get all deployments in order. In order to make sure that
 * our content remains consistent, regardless of when we found out about deployments, we need to preserve some history
 * about pointers. This means that when an entity is overwritten, we will still preserve the entity's data, until we are sure that
 * no older entities can be deployed.
 */
export class PointerManager {

    /** Sorted from newest to oldest */
    private tempDeploymentInfo: EntityDeployment[] = []
    private pointers: Map<EntityType, Cache<Pointer, EntityId | undefined>> = new Map()
    constructor(private storage: PointerStorage,
        private auditOverwrite: AuditOverwrite) {
        // Register type on global map. This way, we don't have to check on each reference
        Object.values(EntityType)
            .forEach((entityType: EntityType) => {
                const cache: Cache<Pointer, EntityId | undefined> = Cache.withCalculation((pointer: Pointer) => this.getPointerFromDisk(pointer, entityType), 1000)
                this.pointers.set(entityType, cache)
            })
    }

    /** Return all active pointers */
    getActivePointers(type: EntityType): Promise<Pointer[]> {
        return this.storage.getActivePointers(type)
    }

    /** Returns the id of the entity being referenced by the given pointer (if any) */
    getEntityInPointer(type: EntityType, pointer: Pointer): Promise<EntityId | undefined> {
        return this.getPointerMap(type).get(pointer)
    }

    /** When we have a new immutable time, we can get rid of all the deployments that happened before */
    setImmutableTime(immutableDeploymentTimestamp: Timestamp) {
        const index: number | undefined = this.tempDeploymentInfo.findIndex(deployment => deployment.deploymentTimestamp < immutableDeploymentTimestamp)
        if (index) {
            this.tempDeploymentInfo.splice(index, this.tempDeploymentInfo.length - index)
        }
    }

    /**
     * Commit a new entity. This method will take care of potential synchronization problems.
     */
    async commitEntity(entityBeingDeployed: Entity, deploymentTimestamp: Timestamp, entityFetcher: (entityId: EntityId) => Promise<Entity | undefined>): Promise<void> {

        // Set up the new deployment
        let newDeployment: EntityDeployment = {
            entityId: entityBeingDeployed.id,
            entityType: entityBeingDeployed.type,
            pointers: entityBeingDeployed.pointers,
            entityTimestamp: entityBeingDeployed.timestamp,
            overwrittenEntities: new Map(),
            deploymentTimestamp: deploymentTimestamp,
        }

        // Mark all older entities that conflict as overwritten
        await this.overwriteOlderDeployments(newDeployment, entityFetcher)

        // Mark this entity as overwritten or commit it
        await this.getOverwrittenOrCommit(newDeployment)

        // Save
        this.saveNewDeployment(newDeployment)
    }

    /** Check if there is another entity that would overwrite this one. If not, then commit the new deployment */
    private async getOverwrittenOrCommit(newDeployment: EntityDeployment) {
        let entityDeployment: EntityDeployment | undefined = this.findClosestNewerEntityThatContainsPointers(newDeployment);
        if (entityDeployment) {
            // If found, then this entity deployment would overwrite the entity being deployed, so mark it
            entityDeployment.overwrittenEntities.set(newDeployment.entityId, entityDeployment)

            // Set audit info (as overwritten)
            await this.auditOverwrite.setEntityAsOverwritten(newDeployment.entityId, entityDeployment.entityId)
        } else {
            console.log(`Commiting ${newDeployment.entityId} to pointers ${newDeployment.pointers}`)
            // If not found, then no entity would overwrite the entity being deployed, so we make the pointers reference the entity
            const storageActions = newDeployment.pointers.map(pointer => this.storage.setPointerReference(newDeployment.entityType, pointer, newDeployment.entityId))
            newDeployment.pointers.forEach(pointer => this.getPointerMap(newDeployment.entityType).invalidate(pointer))
            await Promise.all(storageActions)
        }
    }

    /**
     * This method takes the new deployment and marks all the necessary entities as overwritten
     */
    private overwriteOlderDeployments(newDeployment: EntityDeployment, entityFetcher: (entityId: EntityId) => Promise<Entity | undefined>) {
        for (const pointer of newDeployment.pointers) {
            let overwrite: [EntityDeployment, EntityId] | undefined = this.findClosestNewerEntityThatOverwritesPointer(newDeployment, pointer);
            if (overwrite) {
                // If there is already an overwrite, then we must set the new deployment in the middle
                return this.setNewDeploymentAsOverwrite(overwrite, newDeployment);
            }
            else {
                // If the is no current overwrite, then we check if there is already an entity on the pointer
                return this.overwriteCurrentEntity(newDeployment, pointer, entityFetcher);
            }
        }
    }

    private async overwriteCurrentEntity(newDeployment: EntityDeployment, pointer: string, entityFetcher: (entityId: EntityId) => Promise<Entity | undefined>) {
        const currentEntityId: EntityId | undefined = await this.getEntityInPointer(newDeployment.entityType, pointer);
        if (currentEntityId) {
            // Get the entity's data
            const currentEntity: Entity | undefined = await entityFetcher(currentEntityId)
            if (currentEntity) {
                const currentEntityReference = {
                    entityId: currentEntity.id,
                    pointers: currentEntity.pointers,
                    entityTimestamp: currentEntity.timestamp
                };
                if (this.isDeploymentNewerThan(newDeployment, currentEntityReference)) {
                    // Mark current entity as overwritten by new deployment
                    newDeployment.overwrittenEntities.set(currentEntityId, currentEntityReference)

                    console.log(`Removing ${currentEntityReference.entityId} from ${currentEntityReference.pointers}`)
                    // Delete pointer reference
                    const deleteActions = currentEntityReference.pointers.map(pointer => this.storage.deletePointerReference(newDeployment.entityType, pointer))
                    currentEntityReference.pointers.forEach(pointer => this.getPointerMap(newDeployment.entityType).invalidate(pointer))
                    await Promise.all(deleteActions)

                    // Change audit info
                    await this.auditOverwrite.setEntityAsOverwritten(currentEntityId, newDeployment.entityId)
                }
            }
        }
    }

    /**
     * This method find the closest (but newer) entity deployment in respect to the given timestamp that:
     * 1. Overwrote an entity that is older than the given timestamp
     * 2. The overwritten entity has the given pointer
     *
     * The method returns undefined if no such deployment exists
     */
    private findClosestNewerEntityThatOverwritesPointer(newDeployment: EntityDeployment, pointer: Pointer): [EntityDeployment, EntityId] | undefined {
        for (let i = this.tempDeploymentInfo.length - 1; i >= 0; i--) {
            const deploymentInfo = this.tempDeploymentInfo[i]

            if (this.isDeploymentNewerThan(deploymentInfo, newDeployment)) {
                for (const [entityId, entityReference] of deploymentInfo.overwrittenEntities.entries()) {
                    if (!this.isDeploymentNewerThan(newDeployment, entityReference) && entityReference.pointers.includes(pointer)) {
                        return [deploymentInfo, entityId]
                    }
                }
            }
        }
        return undefined
    }

    private setNewDeploymentAsOverwrite(overwrite: [EntityDeployment, string], newDeployment: EntityDeployment) {
        const [deployment, overwrittenEntity] = overwrite;
        // Mark entity as overwritten by new deployment
        const entityReference = deployment.overwrittenEntities.get(overwrittenEntity) as EntityReferenceData;
        newDeployment.overwrittenEntities.set(overwrittenEntity, entityReference);

        // Delete overwrite from the newer deployment
        deployment.overwrittenEntities.delete(overwrittenEntity);

        // Change audit info
        return this.auditOverwrite.setEntityAsOverwritten(overwrittenEntity, newDeployment.entityId);
    }

    private getPointerMap(entityType: EntityType): Cache<Pointer, EntityId> {
        return this.pointers.get(entityType) as Cache<Pointer, EntityId>
    }

    /** Return the deployment that:
     * 1. Is newer than the new deployment (in terms of entity's timestamp)
     * 2. Contains any of the new deployment's pointers
     * 3. Is the closest in time to the current deployment
     */
    private findClosestNewerEntityThatContainsPointers(newDeployment: EntityDeployment): EntityDeployment | undefined {
        for (let i = this.tempDeploymentInfo.length - 1; i >= 0; i--) {
            const deploymentInfo = this.tempDeploymentInfo[i]

            if (this.isDeploymentNewerThan(deploymentInfo, newDeployment) &&
                this.intersects(deploymentInfo.pointers, newDeployment.pointers)) {
                return deploymentInfo
            }
        }
        return undefined
    }

    private saveNewDeployment(newDeployment: EntityDeployment) {
        const index = this.tempDeploymentInfo.findIndex(deployment => !this.isDeploymentNewerThan(deployment, newDeployment))
        if (index >= 0) {
            this.tempDeploymentInfo.splice(index, 0, newDeployment)
        } else {
            this.tempDeploymentInfo.push(newDeployment)
        }

        // TODO: Send to storage
    }

    private intersects(pointers1: Pointer[], pointers2: Pointer[]): boolean {
        for (const pointer of pointers1) {
            if (pointers2.includes(pointer)) {
                return true
            }
        }
        return false
    }

    private getPointerFromDisk(pointer: Pointer, type: EntityType): Promise<EntityId | undefined> {
        try {
            return this.storage.getPointerReference(type, pointer)
        } catch (e) {
            return Promise.resolve(undefined)
        }
    }

    /** Returns true iff deployment1 is newer than deployment2 */
    private isDeploymentNewerThan<T extends {entityId: EntityId, entityTimestamp: Timestamp}>(deployment1: T, deployment2: T) {
        return deployment1.entityTimestamp > deployment2.entityTimestamp ||
            (deployment1.entityTimestamp == deployment2.entityTimestamp && deployment1.entityId > deployment2.entityId)
    }

}

type EntityDeployment = {
    entityId: EntityId,
    entityType: EntityType,
    pointers: Pointer[],
    entityTimestamp: Timestamp,
    overwrittenEntities: Map<EntityId, EntityReferenceData>,
    deploymentTimestamp: Timestamp,
}

type EntityReferenceData = {
    pointers: Pointer[],
    entityTimestamp: Timestamp,
    entityId: EntityId,
}