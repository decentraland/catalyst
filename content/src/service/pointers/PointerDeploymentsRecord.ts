import { EntityType, Pointer, EntityId, Entity } from "../Entity";
import { Timestamp } from "../time/TimeSorting";

/**
 * When syncing with other nodes, we might not get all deployments in order. In order to make sure that
 * our content remains consistent, regardless of when we found out about deployments, we need to preserve some history
 * about pointers. This means that when an entity is overwritten, we will still preserve the entity's data, until we are sure that
 * no older entities can be deployed.
 */
export class PointerDeploymentsRecord {

    private readonly tempDeploymentInfo: EntityDeployment[] // sorted from newest to oldest, by entity timestamp
    constructor(private readonly pointerReader: (entityType: EntityType, pointer: Pointer) => Promise<EntityId | undefined>,
        storedTempDeployments: Buffer | undefined) {
            this.tempDeploymentInfo = storedTempDeployments ? JSON.parse(storedTempDeployments.toString()) : []
        }

    /** Return the information necessary to store */
    getInformationToStore(): Buffer {
        return Buffer.from(JSON.stringify(this.tempDeploymentInfo))
    }

    /** When we have a new immutable time, we can get rid of all the deployments that happened before */
    setTimeAsImmutable(immutableDeploymentTimestamp: Timestamp): void {
        for (let i = this.tempDeploymentInfo.length - 1; i >= 0; i--) {
            const deployment = this.tempDeploymentInfo[i];
            if (deployment.deploymentTimestamp < immutableDeploymentTimestamp) {
                this.tempDeploymentInfo.splice(i, 1)
            }
        }
    }

    /**
     * Commit a new entity and return the result
     */
    async exerciseCommit(entityBeingDeployed: Entity, deploymentTimestamp: Timestamp, entityFetcher: (entityId: EntityId) => Promise<Entity | undefined>): Promise<CommitResult> {
        // Set up the new deployment
        const newDeployment: EntityDeployment = this.buildDeployment(entityBeingDeployed, deploymentTimestamp)

        // Add deployment to temp info
        const insertionIndex = this.insertNewDeployment(newDeployment)

        // Check which older deployments will be overwritten
        const [overwrittenEntities, pointersToDelete] = await this.calculateOlderOverwrittenDeployments(newDeployment, insertionIndex, this.entityFetcherToReferenceFinder(entityFetcher))

        // Check if a newer entity overwrites the new deployment
        const overwritingEntity: EntityId | undefined = this.wouldGetOverwritten(newDeployment, insertionIndex)

        // Prepare result
        const result: CommitResult = {
            overwrites: new Map(),
            deletedPointers: pointersToDelete,
            committed: !overwritingEntity,
        }

        // Set entities overwritten by new deployment
        overwrittenEntities.forEach(overwrittenEntity => result.overwrites.set(overwrittenEntity, newDeployment.entityId))

        // Set if the new deployment was overwritten
        if (overwritingEntity) {
            result.overwrites.set(newDeployment.entityId, overwritingEntity)
        }

        return result
    }

    /**
     * This method takes the new deployment and returns all the entities that were overwritten by the new deployment
     */
    private async calculateOlderOverwrittenDeployments(newDeployment: EntityDeployment, insertionIndex: number, referenceFinder: (type: EntityType, pointer: Pointer) => Promise<EntityReferenceData | undefined>): Promise<[Set<EntityId>, Set<Pointer>]> {
        const deletedPointers: Set<Pointer> = new Set()

        // We will keep track of all the overwrites that need to be modified, as the new deployment will be placed "in the middle"
        const overwritesToRewrite: Map<EntityId, EntityDeployment>  = new Map()

        for (const pointer of newDeployment.pointers) {
            let overwrite: [EntityDeployment, EntityId] | undefined = this.findClosestNewerEntityThatOverwritesPointer(newDeployment, insertionIndex, pointer);
            if (overwrite) {
                // If there was an overwrite, then save it for later processing
                const [deploymentToUpdate, overwrittenEntityId] = overwrite
                overwritesToRewrite.set(overwrittenEntityId, deploymentToUpdate)
            } else {
                // If the is no overwrite, then we check if there is already an entity on the pointer that needs to be overwritten
                const reference = await this.checkIfCurrentEntityShouldBeOverwritten(newDeployment, pointer, referenceFinder);
                if (reference) {
                    // Mark entity as overwritten
                    newDeployment.overwrittenEntities.set(reference.entityId, reference)
                    // Since the reference was stored on disk, we need to delete it
                    reference.pointers.forEach(pointer => deletedPointers.add(pointer))
                }
            }
        }

        // Update all deployments, by removing the reference from them and adding it to the new deployment
        overwritesToRewrite.forEach((deploymentToUpdate, overwrittenEntityId) => {
            // Find current reference
            const entityReference = deploymentToUpdate.overwrittenEntities.get(overwrittenEntityId) as EntityReferenceData;

            // Mark entity as overwritten by new deployment
            newDeployment.overwrittenEntities.set(overwrittenEntityId, entityReference);

            // Delete overwrite from the newer deployment
            deploymentToUpdate.overwrittenEntities.delete(overwrittenEntityId);
        })

        return [new Set(newDeployment.overwrittenEntities.keys()), deletedPointers]
    }

    /** Checks if the new deployment should overwrite what is current stored under the given pointer */
    private async checkIfCurrentEntityShouldBeOverwritten(newDeployment: EntityDeployment, pointer: string, referenceFinder: (type: EntityType, pointer: Pointer) => Promise<EntityReferenceData | undefined>): Promise<EntityReferenceData | undefined> {
        const currentReference: EntityReferenceData | undefined = await referenceFinder(newDeployment.entityType, pointer);
        if (currentReference && this.isDeploymentNewerThan(newDeployment, currentReference)) {
            return currentReference
        } else {
            return undefined
        }
    }

    /** Check if there is another entity that would overwrite this one. If not, then commit the new deployment */
    private wouldGetOverwritten(newDeployment: EntityDeployment, insertionIndex: number): EntityId | undefined {
        const overwritingDeployment: EntityDeployment | undefined = this.findDeploymentThatWouldOverwriteNewDeployment(newDeployment, insertionIndex);
        if (overwritingDeployment) {
            // If found, then this entity deployment would overwrite the entity being deployed, so mark it
            overwritingDeployment.overwrittenEntities.set(newDeployment.entityId, { ...overwritingDeployment })
        }
        return overwritingDeployment?.entityId
    }

    /**
     * This method find the closest (but newer) entity deployment in respect to the new deployment that:
     * 1. Overwrote an entity that was deployed before than the new deployment
     * 2. The overwritten entity has the given pointer
     *
     * The method returns undefined if no such deployment exists
     */
    private findClosestNewerEntityThatOverwritesPointer(newDeployment: EntityDeployment, insertionIndex: number, pointer: Pointer): [EntityDeployment, EntityId] | undefined {
        for (let i = insertionIndex - 1; i >= 0; i--) {
            const deploymentInfo = this.tempDeploymentInfo[i]

            for (const [entityId, entityReference] of deploymentInfo.overwrittenEntities.entries()) {
                if (this.isDeploymentNewerThan(newDeployment, entityReference) && entityReference.pointers.includes(pointer)) {
                    return [deploymentInfo, entityId]
                }
            }
        }
        return undefined
    }

    /** Return the deployment that:
     * 1. Is newer than the new deployment (in terms of entity's timestamp)
     * 2. Contains any of the new deployment's pointers
     * 3. Is the closest in time to the current deployment
     */
    private findDeploymentThatWouldOverwriteNewDeployment(newDeployment: EntityDeployment, insertionIndex: number): EntityDeployment | undefined {
        for (let i = insertionIndex - 1; i >= 0; i--) {
            const deploymentInfo = this.tempDeploymentInfo[i]

            if (this.intersects(deploymentInfo.pointers, newDeployment.pointers)) {
                return deploymentInfo
            }
        }
        return undefined
    }

    /** Return the index where it was inserted */
    private insertNewDeployment(newDeployment: EntityDeployment): number {
        const index = this.tempDeploymentInfo.findIndex(deployment => !this.isDeploymentNewerThan(deployment, newDeployment))
        if (index >= 0) {
            this.tempDeploymentInfo.splice(index, 0, newDeployment)
            return index
        } else {
            this.tempDeploymentInfo.push(newDeployment)
            return this.tempDeploymentInfo.length - 1
        }
    }

    /** Given two lists of pointers, returns whether they intersect or not */
    private intersects(pointers1: Pointer[], pointers2: Pointer[]): boolean {
        const pointers2Set: Set<Pointer> = new Set(pointers2)
        for (const pointer of pointers1) {
            if (pointers2Set.has(pointer)) {
                return true
            }
        }
        return false
    }

    /** Returns true iff deployment1 is newer than deployment2 */
    private isDeploymentNewerThan<T extends {entityId: EntityId, entityTimestamp: Timestamp}>(deployment1: T, deployment2: T) {
        return deployment1.entityTimestamp > deployment2.entityTimestamp ||
            (deployment1.entityTimestamp == deployment2.entityTimestamp && deployment1.entityId > deployment2.entityId)
    }

    private buildDeployment(entityBeingDeployed: Entity, deploymentTimestamp: number): EntityDeployment {
        return {
            entityId: entityBeingDeployed.id,
            entityType: entityBeingDeployed.type,
            pointers: entityBeingDeployed.pointers,
            entityTimestamp: entityBeingDeployed.timestamp,
            overwrittenEntities: new Map(),
            deploymentTimestamp: deploymentTimestamp,
        };
    }

    private entityFetcherToReferenceFinder(entityFetcher: (entityId: EntityId) => Promise<Entity | undefined>): (type: EntityType, pointer: Pointer) => Promise<EntityReferenceData | undefined> {
        return async (type, pointer) => {
            const entityId = await this.pointerReader(type, pointer);
            if (entityId) {
                const entity = await entityFetcher(entityId);
                if (entity) {
                    return {
                        entityId: entity.id,
                        pointers: entity.pointers,
                        entityTimestamp: entity.timestamp
                    };
                }
            }
            return undefined
        }
    }

}

export type EntityDeployment = {
    entityId: EntityId,
    entityType: EntityType,
    pointers: Pointer[],
    entityTimestamp: Timestamp,
    overwrittenEntities: Map<EntityId, EntityReferenceData>,
    deploymentTimestamp: Timestamp,
}

export type CommitResult = {
    // Map from overwritten entity to overwriting entity
    overwrites: Map<EntityId, EntityId>,
    // Pointers that need to be deleted, since the new deployment overwrote an active entity
    deletedPointers: Set<Pointer>,
    // Whether the new deployment can be committed or not (if a newer deployment would overwrite it, then don't commit it)
    committed: boolean,
}

type EntityReferenceData = {
    pointers: Pointer[],
    entityTimestamp: Timestamp,
    entityId: EntityId,
}