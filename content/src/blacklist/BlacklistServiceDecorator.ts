import { MetaverseContentService, ContentFile, ServerStatus } from "../service/Service";
import { Entity, EntityType, EntityId, Pointer } from "../service/Entity";
import { ContentFileHash } from "../service/Hashing";
import { Blacklist } from "./Blacklist";
import { buildPointerTarget, buildEntityTarget, BlacklistTarget, buildContentTarget, buildAddressTarget } from "./BlacklistTarget";
import { AuditInfo } from "../service/audit/Audit";
import { EntityFactory } from "../service/EntityFactory";
import { ServiceImpl } from "../service/ServiceImpl";
import { Authenticator } from "../service/auth/Authenticator";

/**
 * This decorator takes a MetaverseContentService and adds blacklisting functionality to it
 */
export class BlacklistServiceDecorator implements MetaverseContentService {

    static BLACKLISTED_METADATA: string = "Blacklisted"

    constructor(private readonly service: MetaverseContentService,
        private readonly blacklist: Blacklist) { }

    async getEntitiesByPointers(type: EntityType, pointers: Pointer[]): Promise<Entity[]> {
        const nonBlacklistedPointers: EntityId[] = await this.filterBlacklisted(pointers, pointer => buildPointerTarget(type, pointer))
        const entities: Entity[] = await this.service.getEntitiesByPointers(type, nonBlacklistedPointers);
        return this.sanitizeEntities(entities)
    }

    async getEntitiesByIds(type: EntityType, ids: EntityId[]): Promise<Entity[]> {
        const entities: Entity[] = await this.service.getEntitiesByIds(type, ids);
        return this.sanitizeEntities(entities)
    }

    async getActivePointers(type: EntityType): Promise<Pointer[]> {
        const activePointers: Pointer[] = await this.service.getActivePointers(type);
        return this.filterBlacklisted(activePointers, pointer => buildPointerTarget(type, pointer))
    }

    async getContent(fileHash: ContentFileHash): Promise<Buffer | undefined> {
        const isBlacklisted = await this.isFileHashBlacklisted(fileHash);
        if (isBlacklisted) {
            return undefined
        } else {
            return this.service.getContent(fileHash)
        }
    }

    /** Is content is blacklisted, then we will return that it is not available */
    async isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<string, boolean>> {
        const availability: Map<ContentFileHash, boolean> = await this.service.isContentAvailable(fileHashes)
        const blacklistedEntries: Promise<[ContentFileHash, boolean]>[] = fileHashes.map(fileHash => this.isFileHashBlacklisted(fileHash).then(isBlacklisted => [fileHash, isBlacklisted]))
        const blacklisted: Map<ContentFileHash, boolean> = new Map(await Promise.all(blacklistedEntries))

        for (const [fileHash, isBlacklisted] of blacklisted) {
            if (isBlacklisted) {
                availability.set(fileHash, false)
            }
        }

        return availability
    }

    async getAuditInfo(type: EntityType, id: EntityId): Promise<AuditInfo | undefined> {
        // Retrieve audit info and entity
        const auditInfo = await this.service.getAuditInfo(type, id);

        if (!auditInfo) {
            return undefined
        } else {
            const entity = (await this.service.getEntitiesByIds(type, [id]))[0]

            // Build respective targets
            const entityTarget = buildEntityTarget(type, id);
            const contentTargets: Map<ContentFileHash, BlacklistTarget> = new Map(Array.from(entity.content?.values() ?? [])
                .map(fileHash => [fileHash, buildContentTarget(fileHash)]))
            const allTargets = [entityTarget, ...contentTargets.values()]

            // Check if any of the targets are blacklisted
            const blacklisted: Map<BlacklistTarget, boolean> = await this.blacklist.areTargetsBlacklisted(allTargets);

            // Create new result
            let result: AuditInfo = {
                ...auditInfo
            }

            // If entity is blacklisted, then mark it on the audit info
            if (blacklisted.get(entityTarget)) {
                result.isBlacklisted = true
            }

            // If any of the content is blacklisted, then add them to the audit info
            const blacklistedContent: ContentFileHash[] = Array.from(contentTargets.entries())
                .filter(([, target]) => blacklisted.get(target))
                .map(([fileHash, ]) => fileHash)

            if (blacklistedContent.length > 0) {
                result.blacklistedContent = blacklistedContent
            }

            return result
        }
    }

    getStatus(): Promise<ServerStatus> {
        return this.service.getStatus()
    }

    async deployEntity(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfo, origin: string): Promise<number> {
        // No deployments from blacklisted eth addresses are allowed
        const ownerAddress = Authenticator.ownerAddress(auditInfo)
        if (await this.areBlacklisted(buildAddressTarget(ownerAddress))) {
            throw new Error(`Can't allow a deployment from address '${ownerAddress}' since it was blacklisted.`);
        }

        // Find the entity file
        const entityFile: ContentFile = ServiceImpl.findEntityFile(files)

        // Parse entity file into an Entity
        const entity: Entity = EntityFactory.fromFile(entityFile, entityId)

        // No deployments with blacklisted hash are allowed
        const contentTargets: BlacklistTarget[] = Array.from(entity.content?.values() ?? []).map(fileHash => buildContentTarget(fileHash))
        if (await this.areBlacklisted(...contentTargets)) {
            throw new Error(`Can't allow the deployment since the entity contains a blacklisted content.`);
        }

        // No deployments on blacklisted pointers are allowed
        const pointerTargets: BlacklistTarget[] = entity.pointers.map(pointer => buildPointerTarget(entity.type, pointer));
        if (await this.areBlacklisted(...pointerTargets)) {
            throw new Error(`Can't allow the deployment since the entity contains a blacklisted pointer.`);
        }

        // If all validations passed, then deploy the entity
        return this.service.deployEntity(files, entityId, auditInfo, origin)
    }

    /** When an entity is blacklisted, we don't want to show its content and metadata  */
    private async sanitizeEntities(entities: Entity[]): Promise<Entity[]> {
        // Build the target per entity
        const entityToTarget: Map<Entity, BlacklistTarget> = new Map(entities.map(entity => [entity, buildEntityTarget(entity.type, entity.id)]))

        // Check if targets are blacklisted
        const isTargetBlacklisted: Map<BlacklistTarget, boolean> = await this.blacklist.areTargetsBlacklisted(Array.from(entityToTarget.values()));

        // Sanitize blacklisted entities
        return entities.map(entity => {
            if (isTargetBlacklisted.get(entityToTarget.get(entity) as BlacklistTarget)) {
                return new Entity(entity.id, entity.type, entity.pointers, entity.timestamp, undefined, BlacklistServiceDecorator.BLACKLISTED_METADATA)
            } else {
                return entity
            }
        })
    }

    /** Since entity ids are also file hashes, we need to check for all possible targets */
    private isFileHashBlacklisted(fileHash: string) {
        return this.areBlacklisted(...this.getEntityTargets(fileHash), buildContentTarget(fileHash));
    }

    /** Since we don't know the entity type, we need to check check against all types */
    private getEntityTargets(entityId: EntityId) {
        const types: EntityType[] = Object.keys(EntityType).map(type => EntityType[type])
        return types.map(entityType => buildEntityTarget(entityType, entityId))
    }

    /** Return true if any of the given targets is blacklisted */
    private async areBlacklisted(...targets: BlacklistTarget[]): Promise<boolean> {
        if (targets.length == 0) {
            return false
        } else {
            const result = await this.blacklist.areTargetsBlacklisted(targets)
            return Array.from(result.values()).reduce((accum, currentValue) => accum || currentValue)
        }
    }

    /** Filter out blacklisted targets */
    private async filterBlacklisted<T>(elements: T[], targetBuild: (element: T) => BlacklistTarget): Promise<T[]> {
        const elementToTarget: Map<T, BlacklistTarget> = new Map(elements.map(element => [element, targetBuild(element)]))
        const areBlacklisted = await this.blacklist.areTargetsBlacklisted(Array.from(elementToTarget.values()));
        return Array.from(elementToTarget.entries())
            .filter(([, target]) => !areBlacklisted.get(target))
            .map(([element, ]) => element)
    }
}