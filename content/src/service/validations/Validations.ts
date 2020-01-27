import ms from "ms"
import { EntityId, Pointer, EntityType, Entity } from "../Entity";
import { ENTITY_FILE_NAME } from "../Service";
import { ContentFile } from '../Service';
import { ContentFileHash } from "../Hashing";
import { AccessChecker } from "../access/AccessChecker";
import { Authenticator, EthAddress, AuthChain } from "../auth/Authenticator";
import { ValidationContext, Validation } from "./ValidationContext";
import { AuditInfo } from "../audit/Audit";

export class Validations {

    private errors: string[] = []

    constructor(private accessChecker: AccessChecker) {}

    getErrors(): string[] {
        return this.errors
    }

    /** Validate that the address used was owned by Decentraland */
    validateDecentralandAddress(address: EthAddress, validationContext: ValidationContext) {
        if (validationContext.shouldValidate(Validation.DECENTRALAND_ADDRESS)) {
            if (!Authenticator.isAddressOwnedByDecentraland(address)){
                this.errors.push(`Expected an address owned by decentraland. Instead, we found ${address}`)
            }
        }
    }

    validateEntityHash(entityId: EntityId, entityFileHash: ContentFileHash, validationContext: ValidationContext) {
        if (validationContext.shouldValidate(Validation.ENTITY_HASH)) {
            if (entityId !== entityFileHash) {
                this.errors.push("Entity file's hash didn't match the signed entity id.")
            }
        }
    }

    /** Validate that the signature belongs to the Ethereum address */
    async validateSignature(entityId: EntityId, authChain: AuthChain, validationContext: ValidationContext): Promise<void> {
        if (validationContext.shouldValidate(Validation.SIGNATURE)) {
            if(!await Authenticator.validateSignature(entityId, authChain)) {
                this.errors.push("The signature is invalid.")
            }
        }
    }

    /** Validate that the full request size is within limits */
    // TODO: decide if we want to externalize this as a configuration
    private static MAX_UPLOAD_SIZE = 10 * 1024 * 1024  // 10 MB
    validateRequestSize(files: ContentFile[], validationContext: ValidationContext): void {
        if (validationContext.shouldValidate(Validation.REQUEST_SIZE)) {
            var totalSize = 0
            files.forEach(file => totalSize += file.content.length)
            if (totalSize > Validations.MAX_UPLOAD_SIZE) {
                this.errors.push("The sum of all entity's file exceeds the total allowed size (10 MB).")
            }
        }
    }

    // Validate that entity is actually ok
    validateEntity(entity: Entity, validationContext: ValidationContext) {
        if (validationContext.shouldValidate(Validation.ENTITY_STRUCTURE)) {
            this.validateNoRepeatedPointers(entity)

            // Validate that entity has at least one pointer?
            if (!entity.pointers || entity.pointers.length <= 0) {
                this.errors.push("The entity needs to be pointed by one or more pointers.")
            }
        }
    }

    private validateNoRepeatedPointers(entity: Entity) {
        if (new Set(entity.pointers).size != entity.pointers.length) {
            this.errors.push("There are repeated pointers in your request.")
        }
    }

    /** Validate that the pointers are valid, and that the Ethereum address has write access to them */
    async validateAccess(entityType: EntityType, pointers: Pointer[], ethAddress: EthAddress, validationContext: ValidationContext): Promise<void> {
        if (validationContext.shouldValidate(Validation.ACCESS)) {
            const errors = await this.accessChecker.hasAccess(entityType, pointers, ethAddress);
            this.errors = this.errors.concat(errors)
        }
    }

    /** Validate that the deployment is valid in terms of timing */
    async validateFreshDeployment(entityToBeDeployed: Entity, entitiesByPointersFetcher: (type: EntityType, pointers: Pointer[]) => Promise<Entity[]>, validationContext: ValidationContext): Promise<void> {
        if (validationContext.shouldValidate(Validation.FRESHNESS)) {
            // Validate that pointers aren't referring to an entity with a higher timestamp
            const currentPointedEntities = await entitiesByPointersFetcher(entityToBeDeployed.type, entityToBeDeployed.pointers)
            currentPointedEntities.forEach(currentEntity => {
                if (entityToBeDeployed.timestamp <= currentEntity.timestamp) {
                    this.errors.push("There is a newer entity pointed by one or more of the pointers you provided.")
                }
            })

            // Verify that the timestamp is recent enough. We need to make sure that the definition of recent works with the synchronization mechanism
            this.requestIsRecent(entityToBeDeployed)
        }
    }

    /** Validate that there is no entity with a higher version already deployed that the legacy entity is trying to overwrite */
    async validateLegacyEntity(entityToBeDeployed: Entity,
        auditInfoBeingDeployed: AuditInfo,
        entitiesByPointersFetcher: (type: EntityType, pointers: Pointer[]) => Promise<Entity[]>,
        auditInfoFetcher: (type: EntityType, entityId: EntityId) => Promise<AuditInfo | undefined>,
        validationContext: ValidationContext): Promise<void> {
        if (validationContext.shouldValidate(Validation.LEGACY_ENTITY)) {
            const currentPointedEntities = await entitiesByPointersFetcher(entityToBeDeployed.type, entityToBeDeployed.pointers)
            const currentAuditInfos = await Promise.all(currentPointedEntities.map(entity => auditInfoFetcher(entity.type, entity.id)))
            currentAuditInfos
                .filter((currentAuditInfo): currentAuditInfo is AuditInfo => !!currentAuditInfo)
                .forEach((currentAuditInfo: AuditInfo) => {
                if (currentAuditInfo.version > auditInfoBeingDeployed.version) {
                    this.errors.push(`Found an overlapping entity with a higher version already deployed.`)
                } else if (currentAuditInfo.version == auditInfoBeingDeployed.version && auditInfoBeingDeployed.originalMetadata) {
                    if (!currentAuditInfo.originalMetadata) {
                        this.errors.push(`Found an overlapping entity with a higher version already deployed.`)
                    } else if (currentAuditInfo.originalMetadata.originalVersion > auditInfoBeingDeployed.originalMetadata.originalVersion) {
                        this.errors.push(`Found an overlapping entity with a higher version already deployed.`)
                    }
                }
            })
        }
    }

    // TODO: decide if we want to externalize this as a configuration
    private static REQUEST_TTL = ms('5m') // 5 minutes
    private requestIsRecent(entityToBeDeployed: Entity): void {
        const delta = Date.now() - entityToBeDeployed.timestamp
        if (delta > Validations.REQUEST_TTL || delta < -ms('5s')) {
            this.errors.push("The request is not recent, please submit it again with a new timestamp.")
        }
    }

    /** Validate that uploaded and reported hashes are corrects */
    validateContent(entity: Entity, hashes: Map<ContentFileHash, ContentFile>, alreadyStoredHashes: Map<ContentFileHash, Boolean>, validationContext: ValidationContext) {
        if (validationContext.shouldValidate(Validation.CONTENT)) {
            if (entity.content) {
                let entityHashes: string[] = Array.from(entity.content?.values() ?? [])

                // Validate that all hashes in entity were uploaded, or were already stored on the service
                entityHashes
                .filter(hash => !(hashes.has(hash) || alreadyStoredHashes.get(hash)))
                .forEach(notAvailableHash => this.errors.push(`This hash is referenced in the entity but was not uploaded or previously available: ${notAvailableHash}`))

                // Validate that all hashes that belong to uploaded files are actually reported on the entity
                Array.from(hashes.entries())
                .filter(([, file]) => file.name !== ENTITY_FILE_NAME)
                .map(([hash, ]) => hash)
                .filter(hash => !entityHashes.includes(hash))
                .forEach(unreferencedHash => this.errors.push(`This hash was uploaded but is not referenced in the entity: ${unreferencedHash}`))
            }
        }
    }

}