import ms from "ms"
import { EntityId, Pointer, EntityType, Entity } from "./Entity";
import { ENTITY_FILE_NAME } from "./Service";
import { ContentFile } from './Service';
import { ContentFileHash } from "./Hashing";
import { AccessChecker } from "./access/AccessChecker";
import { Authenticator, EthAddress, Signature } from "./auth/Authenticator";

export class Validation {

    private errors: string[] = []

    constructor(private accessChecker: AccessChecker) {}

    getErrors(): string[] {
        return this.errors
    }

    /** Validate that the signature belongs to the Ethereum address */
    async validateSignature(entityId: EntityId, ethAddress: EthAddress, signature: Signature): Promise<void> {
        if(!await Authenticator.validateSignature(entityId, ethAddress, signature)) {
            this.errors.push("The signature is invalid.")
        }
    }

    /** Validate that the full request size is within limits */
    // TODO: decide if we want to externalize this as a configuration
    private static MAX_UPLOAD_SIZE = 10 * 1024 * 1024  // 10 MB
    validateRequestSize(files: ContentFile[]): void {
        var totalSize = 0
        files.forEach(file => totalSize += file.content.length)
        if (totalSize > Validation.MAX_UPLOAD_SIZE) {
            this.errors.push("The sum of all entity's file exceeds the total allowed size (10 MB).")
        }
    }

    // Validate that entity is actually ok
    validateEntity(entity: Entity) {
        this.validateNoRepeatedPointers(entity)

        // Validate that entity has at least one pointer?
        if (!entity.pointers || entity.pointers.length <= 0) {
            this.errors.push("The entity needs to be pointed by one or more pointers.")
        }
    }

    private validateNoRepeatedPointers(entity: Entity) {
        if (new Set(entity.pointers).size != entity.pointers.length) {
            this.errors.push("There are repeated pointers in your request.")
        }
    }

    /** Validate that the pointers are valid, and that the Ethereum address has write access to them */
    async validateAccess(pointers: Pointer[], ethAddress: EthAddress, entityType: EntityType): Promise<void> {
        if (entityType===EntityType.SCENE) {
            await Promise.all(
                pointers.map(async pointer => {
                    try {
                        const pointerParts: string[] = pointer.split(',')
                        if (pointerParts.length===2) {
                            const x: number = parseInt(pointerParts[0], 10)
                            const y: number = parseInt(pointerParts[1], 10)
                            const hasAccess = await this.accessChecker.hasParcelAccess(x,y,ethAddress)
                            if (!hasAccess) {
                                this.errors.push(`The provided Eth Address does not have access to the following parcel: (${x},${y})`)
                            }
                        } else {
                            this.errors.push(`Scene pointers should only contain two integers separated by a comma, for example (10,10) or (120,-45). Invalid pointer: ${pointer}`)
                        }
                    } catch(e) {
                        this.errors.push(`There was an error processing this pointer: ${pointer}`)
                    }
                })
            )
        }
    }

    /** Validate that the deployment is valid in terms of timing */
    async validateFreshDeployment(entityToBeDeployed: Entity, entitiesByPointersFetcher: (type: EntityType, pointers: Pointer[]) => Promise<Entity[]>): Promise<void> {
        // Validate that pointers aren't referring to an entity with a higher timestamp
        const currentPointedEntities = await entitiesByPointersFetcher(entityToBeDeployed.type, entityToBeDeployed.pointers)
        currentPointedEntities.forEach(currentEntity => {
            if (entityToBeDeployed.timestamp < currentEntity.timestamp) {
                this.errors.push("There is a newer entity pointed by one or more of the pointers you provided.")
            }
        })

        // Verify that the timestamp is recent enough. We need to make sure that the definition of recent works with the synchronization mechanism
        this.requestIsRecent(entityToBeDeployed)
    }

    // TODO: decide if we want to externalize this as a configuration
    private static REQUEST_TTL = ms('10s')
    private requestIsRecent(entityToBeDeployed: Entity): void {
        const delta = Date.now() - entityToBeDeployed.timestamp
        if (delta > Validation.REQUEST_TTL || delta < -ms('1s')) {
            this.errors.push("The request is not recent, please submit it again with a new timestamp.")
        }
    }

    /** Perform type-based validations */
    validateType(entity: Entity): void {
        // TODO
    }

    /** Validate that uploaded and reported hashes are corrects */
    validateContent(entity: Entity, hashes: Map<ContentFileHash, ContentFile>, alreadyStoredHashes: Map<ContentFileHash, Boolean>) {
        if (entity.content) {
            let entityHashes: string[] = Array.from(entity.content?.values() ?? [])

            // Validate that all hashes in entity were uploaded, or were already stored on the service
            entityHashes
            .filter(hash => !(hashes.has(hash) || alreadyStoredHashes.get(hash)))
            .forEach(notAvailableHash => this.errors.push(`This hash is referenced in the entity but was not uploaded or previously available: ${notAvailableHash}`))

            // Validate that all hashes that belong to uploaded files are actually reported on the entity
            Array.from(hashes.entries())
            .filter(entry => entry[1].name !== ENTITY_FILE_NAME)
            .map(entity => entity[0])
            .filter(hash => entityHashes.indexOf(hash)<0)
            .forEach(unreferencedHash => this.errors.push(`This hash was uploaded but is not referenced in the entity: ${unreferencedHash}`))
        }
    }

}