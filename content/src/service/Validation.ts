import { EntityId, Pointer, EntityType, Entity } from "./Entity";
import { EthAddress, Signature } from "./Service";
import { File } from './Service';
import { FileHash } from "./Hashing";

export class Validation {

    /** Validate that the signature belongs to the Ethereum address */
    static validateSignature(entityId: EntityId, ethAddress: EthAddress, signature: Signature): void {
        // TODO
    }

    /** Validate that the full request size is within limits */
    static validateRequestSize(files: Set<File>): void {
        // TODO
    }

    // Validate that entity is actually ok
    static validateEntity(entity: Entity) {
        // TODO: Validate that there are no repeated pointers
    }

    /** Validate that the pointers are valid, and that the Ethereum address has write access to them */
    static validateAccess(pointers: Pointer[], ethAddress: EthAddress, entityType: EntityType): void {
        // TODO
    }

    /** Validate that the deployment is valid in terms of timing */
    static validateFreshDeployment(entityToBeDeployed: Entity): void {
        // TODO: Validate that pointers aren't refering to an entity with a higher timestamp

        // TODO: Verify that the timestamp is recent enough. We need to make sure that the definition of recent works with the synchonization mechanism
    }

    /** Perform type-based validations */
    static validateType(entity: Entity): void {
        // TODO
    }

    /** Validate that uploaded and reported hashes are corrects */
    static validateHashes(entity: Entity, hashes: Map<FileHash, File>, alreadyStoredHashes: Map<FileHash, Boolean>) {
        // TODO: Validate that all hashes in entity were uploaded, or were already stored on the service

        // TODO: Validate that all hashes that belong to uploaded files are actually reported on the entity
    }

}