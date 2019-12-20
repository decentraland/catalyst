import { EntityId, Pointer, EntityType, Entity } from "./Entity";
import { EthAddress, Signature } from "./Service";
import { File } from './Service';
import { FileHash } from "./Hashing";

export class Validation {

    private errors: string[] = []

    getErrors(): string[] {
        return this.errors
    }

    /** Validate that the signature belongs to the Ethereum address */
    validateSignature(entityId: EntityId, ethAddress: EthAddress, signature: Signature): void {
        // TODO
    }

    /** Validate that the full request size is within limits */
    // TODO: decide if we want to externalize this as a configuration
    private static MAX_UPLOAD_SIZE = 10 * 1024 * 1024  // 10 MB
    validateRequestSize(files: File[]): void {
        var totalSize = 0
        files.forEach(file => totalSize += file.content.length)
        if (totalSize > Validation.MAX_UPLOAD_SIZE) {
            this.errors.push("The sum of all entity's file exceeds the total allowed size (10 MB).")
        }
    }

    // Validate that entity is actually ok
    validateEntity(entity: Entity) {
        this.validateNoRepeatedPointers(entity)

        // TODO: Validate that entity has at least one pointer?
    }

    private validateNoRepeatedPointers(entity: Entity) {
        if (new Set(entity.pointers).size != entity.pointers.length) {
            this.errors.push("There are repeated pointers in your request.")
        }
    }

    /** Validate that the pointers are valid, and that the Ethereum address has write access to them */
    validateAccess(pointers: Pointer[], ethAddress: EthAddress, entityType: EntityType): void {
        // TODO
    }

    /** Validate that the deployment is valid in terms of timing */
    async validateFreshDeployment(entityToBeDeployed: Entity, entitiesByPointersFetcher: (type: EntityType, pointers: Pointer[]) => Promise<Entity[]>): Promise<void> {
        // Validate that pointers aren't refering to an entity with a higher timestamp
        const currentPointedEntities = await entitiesByPointersFetcher(entityToBeDeployed.type, entityToBeDeployed.pointers)
        currentPointedEntities.forEach(currentEntity => {
            if (entityToBeDeployed.timestamp < currentEntity.timestamp) {
                this.errors.push("There exist a newer entity pointed by one or more of the pointers you provided.")
            }
        })

        // Verify that the timestamp is recent enough. We need to make sure that the definition of recent works with the synchonization mechanism
        this.requestIsRecent(entityToBeDeployed)
    }

    // TODO: decide if we want to externalize this as a configuration
    private static REQUEST_TTL_SECONDS = 10
    private requestIsRecent(entityToBeDeployed: Entity): void {
        const deltaSeconds = (Date.now() - entityToBeDeployed.timestamp) / 1000
        if (deltaSeconds > Validation.REQUEST_TTL_SECONDS || deltaSeconds < -1) {
            this.errors.push("The request is not recent, please submit it again with a new timestamp.")
        }
    }

    /** Perform type-based validations */
    validateType(entity: Entity): void {
        // TODO
    }

    /** Validate that uploaded and reported hashes are corrects */
    validateHashes(entity: Entity, hashes: Map<FileHash, File>, alreadyStoredHashes: Map<FileHash, Boolean>) {
        // TODO: Validate that all hashes in entity were uploaded, or were already stored on the service

        // TODO: Validate that all hashes that belong to uploaded files are actually reported on the entity
    }

}