import ms from "ms"
import { EntityType, EntityId, ContentFileHash, Timestamp, ContentFile, Pointer, ENTITY_FILE_NAME } from "dcl-catalyst-commons";
import { Entity } from "../Entity";
import { AccessChecker } from "../access/AccessChecker";
import { ValidationContext, Validation } from "./ValidationContext";
import { EntityVersion, AuditInfoBase } from "../Audit";
import { AuthChain, EthAddress } from "dcl-crypto";
import { ContentAuthenticator } from "../auth/Authenticator";
import { DeploymentStatus, NoFailure } from "../errors/FailedDeploymentsManager";
import { httpProviderForNetwork } from '../../../../contracts/utils';
import { happenedBeforeEntities } from "../time/TimeSorting";

export class Validations {

    constructor(private readonly accessChecker: AccessChecker,
        private readonly authenticator: ContentAuthenticator,
        private readonly network: string,
        private readonly requestTtlBackwards: number) { }

    getInstance(): ValidatorInstance {
        return new ValidatorInstance(this.accessChecker,
            this.authenticator,
            this.network,
            this.requestTtlBackwards)
    }
}

export class ValidatorInstance {
    private errors: string[] = []

    constructor(private readonly accessChecker: AccessChecker,
        private readonly authenticator: ContentAuthenticator,
        private readonly network: string,
        private readonly requestTtlBackwards: number) { }

    getErrors(): string[] {
        return this.errors
    }

    /** Make sure that the deployment actually failed, and that it can be re-deployed */
    async validateThatEntityFailedBefore(entity: Entity, deploymentStatusCheck: (entityType: EntityType, entityId: EntityId) => Promise<DeploymentStatus>, validationContext: ValidationContext) {
        if (validationContext.shouldValidate(Validation.MUST_HAVE_FAILED_BEFORE)) {
            const deploymentStatus: DeploymentStatus = await deploymentStatusCheck(entity.type, entity.id);
            if (deploymentStatus === NoFailure.NOT_MARKED_AS_FAILED) {
                this.errors.push(`You are trying to fix an entity that is not marked as failed`)
            }
        }
    }

    /** Validate if the entity can be re deployed or not */
    async validateThatEntityCanBeRedeployed(wasEntityAlreadyDeployed: boolean, validationContext: ValidationContext) {
        if (validationContext.shouldValidate(Validation.NO_REDEPLOYS)) {
            if (wasEntityAlreadyDeployed) {
                this.errors.push(`This entity was already deployed. You can't redeploy it`)
            }
        }
    }

    /** Validate that the address used was owned by Decentraland */
    validateDecentralandAddress(address: EthAddress, validationContext: ValidationContext) {
        if (validationContext.shouldValidate(Validation.DECENTRALAND_ADDRESS)) {
            if (!this.authenticator.isAddressOwnedByDecentraland(address)){
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
    async validateSignature(entityId: EntityId, entityTimestamp: Timestamp, authChain: AuthChain, validationContext: ValidationContext): Promise<void> {
        if (validationContext.shouldValidate(Validation.SIGNATURE)) {
            const validationResult = await this.authenticator.validateSignature(entityId, authChain, httpProviderForNetwork(this.network), entityTimestamp)
            if(!validationResult.ok) {
                this.errors.push("The signature is invalid. " + validationResult.message)
            }
        }
    }

    /** Validate that the full request size is within limits */
    private static MAX_UPLOAD_SIZE_PER_POINTER_MB = 15
    private static MAX_UPLOAD_SIZE_PER_POINTER = ValidatorInstance.MAX_UPLOAD_SIZE_PER_POINTER_MB * 1024 * 1024
    validateRequestSize(files: ContentFile[], pointers: Pointer[], validationContext: ValidationContext): void {
        if (validationContext.shouldValidate(Validation.REQUEST_SIZE)) {
            var totalSize = 0
            files.forEach(file => totalSize += file.content.byteLength)
            const sizePerPointer = totalSize / pointers.length
            if (sizePerPointer > ValidatorInstance.MAX_UPLOAD_SIZE_PER_POINTER) {
                this.errors.push(`The deployment is too big. The maximum allowed size per pointer is ${ValidatorInstance.MAX_UPLOAD_SIZE_PER_POINTER_MB} MB. You can upload up to ${pointers.length * ValidatorInstance.MAX_UPLOAD_SIZE_PER_POINTER} bytes but you tried to upload ${totalSize}.`)
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
    async validateAccess(entityType: EntityType, pointers: Pointer[], timestamp: Timestamp, ethAddress: EthAddress, validationContext: ValidationContext): Promise<void> {
        if (validationContext.shouldValidate(Validation.ACCESS)) {
            const errors = await this.accessChecker.hasAccess(entityType, pointers, timestamp, ethAddress);
            this.errors = this.errors.concat(errors)
        }
    }

    /** Validate that the deployment is recent */
    private static REQUEST_TTL_FORWARDS: number = ms('15m')
    validateDeploymentIsRecent(entityToBeDeployed: Entity, validationContext: ValidationContext): void {
        if (validationContext.shouldValidate(Validation.RECENT)) {
            // Verify that the timestamp is recent enough. We need to make sure that the definition of recent works with the synchronization mechanism
            const delta = Date.now() - entityToBeDeployed.timestamp
            if (delta > this.requestTtlBackwards) {
                this.errors.push("The request is not recent enough, please submit it again with a new timestamp.")
            } else if(delta < -ValidatorInstance.REQUEST_TTL_FORWARDS) {
                this.errors.push("The request is too far in the future, please submit it again with a new timestamp.")
            }
        }
    }

    /** Validate that there are no newer deployments on the entity's pointers */
    async validateNoNewerEntitiesOnPointers(entityToBeDeployed: Entity, areThereNewerEntities: (entity: Entity) => Promise<boolean>, validationContext: ValidationContext): Promise<void> {
        if (validationContext.shouldValidate(Validation.NO_NEWER)) {
            // Validate that pointers aren't referring to an entity with a higher timestamp
            if (await areThereNewerEntities(entityToBeDeployed)) {
                this.errors.push("There is a newer entity pointed by one or more of the pointers you provided.")
            }
        }
    }

    /** Validate that there is no entity with a higher version already deployed that the legacy entity is trying to overwrite */
    async validateLegacyEntity(entityToBeDeployed: Entity,
        auditInfoBeingDeployed: AuditInfoBase,
        entitiesByPointersFetcher: (type: EntityType, pointers: Pointer[]) => Promise<Entity[]>,
        auditInfoFetcher: (type: EntityType, entityId: EntityId) => Promise<AuditInfoBase | undefined>,
        validationContext: ValidationContext): Promise<void> {
        if (validationContext.shouldValidate(Validation.LEGACY_ENTITY)) {
            if (auditInfoBeingDeployed.originalMetadata && auditInfoBeingDeployed.originalMetadata.originalVersion === EntityVersion.V2) {
                const currentPointedEntities = await entitiesByPointersFetcher(entityToBeDeployed.type, entityToBeDeployed.pointers)
                const currentAuditInfos: Map<Entity, AuditInfoBase | undefined> = new Map(await Promise.all(currentPointedEntities.map<Promise<[Entity, AuditInfoBase | undefined]>>(async entity => [entity, await auditInfoFetcher(entity.type, entity.id)])))
                Array.from(currentAuditInfos.entries())
                    .filter(([, currentAuditInfo]) => !!currentAuditInfo)
                    .map<[Entity, AuditInfoBase]>(([currentEntity, currentAuditInfo]) => [currentEntity, currentAuditInfo!!])
                    .forEach(([currentEntity, currentAuditInfo]) => {
                    if (happenedBeforeEntities(currentEntity, entityToBeDeployed)) {
                        if (currentAuditInfo.version > auditInfoBeingDeployed.version) {
                            this.errors.push(`Found an overlapping entity with a higher version already deployed.`)
                        } else if (currentAuditInfo.version == auditInfoBeingDeployed.version && auditInfoBeingDeployed.originalMetadata) {
                            if (!currentAuditInfo.originalMetadata) {
                                this.errors.push(`Found an overlapping entity with a higher version already deployed.`)
                            } else if (currentAuditInfo.originalMetadata.originalVersion > auditInfoBeingDeployed.originalMetadata.originalVersion) {
                                this.errors.push(`Found an overlapping entity with a higher version already deployed.`)
                            }
                        }
                    }
                })
            } else {
                this.errors.push(`Found a legacy entity without original metadata or the original version might not be considered legacy.`)
            }
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