import { ContentFileHash, Hashing } from "./Hashing";
import { EntityType, Pointer, EntityId, Entity } from "./Entity";
import { Validator } from "./validations/Validator";
import { MetaverseContentService, ENTITY_FILE_NAME, ContentFile, ServerStatus, TimeKeepingService, ClusterDeploymentsService } from "./Service";
import { Timestamp } from "./time/TimeSorting";
import { EntityFactory } from "./EntityFactory";
import { HistoryManager } from "./history/HistoryManager";
import { NameKeeper, ServerName } from "./naming/NameKeeper";
import { ContentAnalytics } from "./analytics/ContentAnalytics";
import { PointerManager } from "./pointers/PointerManager";
import { AccessChecker } from "./access/AccessChecker";
import { ServiceStorage } from "./ServiceStorage";
import { Cache } from "./caching/Cache"
import { AuditManager, AuditInfo } from "./audit/Audit";
import { EthAddress, Signature } from "./auth/Authenticator";
import { Validations, Validation } from "./validations/Validation";
import { CONTENT_KATALYST_VERSION } from "../Environment";

export class ServiceImpl implements MetaverseContentService, TimeKeepingService, ClusterDeploymentsService {

    private entities: Cache<EntityId, Entity | undefined>

    private constructor(
        private storage: ServiceStorage,
        private historyManager: HistoryManager,
        private auditManager: AuditManager,
        private pointerManager: PointerManager,
        private nameKeeper: NameKeeper,
        private analytics: ContentAnalytics,
        private accessChecker: AccessChecker,
        private lastImmutableTime: Timestamp,
        private ignoreValidationErrors: boolean) {
        this.entities = Cache.withCalculation((entityId: EntityId) => this.storage.getEntityById(entityId), 1000)
    }

    static async build(storage: ServiceStorage,
        historyManager: HistoryManager,
        auditManager: AuditManager,
        pointerManager: PointerManager,
        nameKeeper: NameKeeper,
        analytics: ContentAnalytics,
        accessChecker: AccessChecker,
        ignoreValidationErrors: boolean = false): Promise<ServiceImpl>{
            const lastImmutableTime: Timestamp = await historyManager.getLastImmutableTime() ?? 0
            return new ServiceImpl(storage, historyManager, auditManager, pointerManager, nameKeeper,
                analytics, accessChecker, lastImmutableTime, ignoreValidationErrors)
        }

    getEntitiesByPointers(type: EntityType, pointers: Pointer[]): Promise<Entity[]> {
        return Promise.all(pointers
            .map((pointer: Pointer) => this.pointerManager.getEntityInPointer(type, pointer)))
            .then((entityIds:(EntityId|undefined)[]) => entityIds.filter(entity => entity !== undefined))
            .then(entityIds => this.getEntitiesByIds(type, entityIds as EntityId[]))
    }

    getEntitiesByIds(type: EntityType, ids: EntityId[]): Promise<Entity[]> {
        return Promise.all(ids
            .filter((elem, pos, array) => array.indexOf(elem) == pos) // Removing duplicates. Quickest way to do so.
            .map((entityId: EntityId) => this.entities.get(entityId)))
            .then((entities:(Entity | undefined)[]) => entities.filter(entity => entity !== undefined)) as Promise<Entity[]>
    }

    getActivePointers(type: EntityType): Promise<Pointer[]> {
        return this.pointerManager.getActivePointers(type)
    }

    async deployEntity(files: ContentFile[], entityId: EntityId, ethAddress: EthAddress, signature: Signature): Promise<Timestamp> {
        return this.deployEntityWithServerAndTimestamp(files, entityId, ethAddress, signature, this.nameKeeper.getServerName(), Date.now, Validations.ALL)
    }

    // TODO: Maybe move this somewhere else?
    private async deployEntityWithServerAndTimestamp(files: ContentFile[], entityId: EntityId, ethAddress: EthAddress, signature: Signature, serverName: ServerName, timestampGenerator: () => Timestamp, validations: Validations): Promise<Timestamp> {
        // Find entity file and make sure its hash is the expected
        const entityFile: ContentFile = ServiceImpl.findEntityFile(files)
        const entityFileHash = await Hashing.calculateHash(entityFile);
        if (validations.shouldExecute(Validation.ENTITY_HASH) && entityId !== entityFileHash) {
            throw new Error("Entity file's hash didn't match the signed entity id.")
        }

        const validation = new Validator(this.accessChecker)
        // Validate signature
        await validation.validateSignature(entityId, ethAddress, signature)

        // Validate request size
        validation.validateRequestSize(files)

        // Parse entity file into an Entity
        const entity: Entity = EntityFactory.fromFile(entityFile, entityId)

        // Validate entity
        validation.validateEntity(entity)

        // Validate ethAddress access
        await validation.validateAccess(entity.pointers, ethAddress, entity.type)

        if (validations.shouldExecute(Validation.FRESHNESS)) {
            // Validate that the entity is "fresh"
            await validation.validateFreshDeployment(entity, (type,pointers) => this.getEntitiesByPointers(type, pointers))
        }

        // Type validation
        validation.validateType(entity)

        // Hash all files, and validate them
        const hashes: Map<ContentFileHash, ContentFile> = await Hashing.calculateHashes(files)

        // If the entity was blacklisted across the whole cluster, then the entityFileHash will be different from the entity id
        hashes.delete(entityFileHash)
        hashes.set(entityId, entityFile)

        const alreadyStoredContent: Map<ContentFileHash, Boolean> = await this.isContentAvailable(Array.from(entity.content?.values() ?? []));

        if (validations.shouldExecute(Validation.CONTENT)) {
            validation.validateContent(entity, hashes, alreadyStoredContent)
        }

        if (!this.ignoreValidationErrors && validation.getErrors().length > 0) {
            throw new Error(validation.getErrors().join('\n'))
        }

        // IF THIS POINT WAS REACHED, THEN THE DEPLOYMENT WILL BE COMMITTED

        // Check if the entity had already been deployed previously
        const wasEntityAlreadyDeployed = await this.isEntityAlreadyDeployed(entityId);

        // Store the entity's content
        await this.storeEntityContent(hashes, alreadyStoredContent)

        // Calculate timestamp
        const deploymentTimestamp: Timestamp = timestampGenerator()

        if (!wasEntityAlreadyDeployed) {
            // Save audit information
            await this.storeAuditInfo(entityId, ethAddress, signature, deploymentTimestamp)

            // Commit to pointers (this needs to go after audit store, since we might end up overwriting it)
            await this.pointerManager.commitEntity(entity, deploymentTimestamp, entityId => this.entities.get(entityId));

            // Add the new deployment to history
            await this.historyManager.newEntityDeployment(serverName, entity, deploymentTimestamp)

            // Record deployment for analytics
            this.analytics.recordDeployment(this.nameKeeper.getServerName(), entity, ethAddress)
        }

        return deploymentTimestamp
    }

    private storeAuditInfo(entityId: EntityId, ethAddress: EthAddress, signature: Signature, deployedTimestamp: Timestamp): Promise<void> {
         const auditInfo: AuditInfo = {
            deployedTimestamp,
            ethAddress,
            signature,
            version: CONTENT_KATALYST_VERSION,
        }
        return this.auditManager.setAuditInfo(entityId, auditInfo)
    }

    private storeEntityContent(hashes: Map<ContentFileHash, ContentFile>, alreadyStoredHashes: Map<ContentFileHash, Boolean>): Promise<any> {
        // If entity was committed, then store all it's content (that isn't already stored)
        const contentStorageActions: Promise<void>[] = Array.from(hashes.entries())
            .filter(([fileHash, file]) => !alreadyStoredHashes.get(fileHash))
            .map(([fileHash, file]) => this.storage.storeContent(fileHash, file.content))

        return Promise.all(contentStorageActions)
    }

    static findEntityFile(files: ContentFile[]): ContentFile {
        const filesWithName = files.filter(file => file.name === ENTITY_FILE_NAME)
        if (filesWithName.length === 0) {
            throw new Error(`Failed to find the entity file. Please make sure that it is named '${ENTITY_FILE_NAME}'.`)
        } else if (filesWithName.length > 1) {
            throw new Error(`Found more than one file called '${ENTITY_FILE_NAME}'. Please make sure you upload only one with that name.`)
        }

        return filesWithName[0];
    }

    async getContent(fileHash: ContentFileHash): Promise<Buffer | undefined> {
        return this.storage.getContent(fileHash);
    }

    async getAuditInfo(type: EntityType, id: EntityId): Promise<AuditInfo> {
        const auditInfo: AuditInfo | undefined = await this.auditManager.getAuditInfo(id);
        return this.assertDefined(auditInfo, `Failed to find the audit information for the entity with type ${type} and id ${id}.`)
    }

    async isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>> {
        return this.storage.isContentAvailable(fileHashes)
    }

    private assertDefined<T>(value: T | undefined, errorMessage: string): T {
        if (!value) {
            throw new Error(errorMessage)
        }
        return value
    }

    getStatus(): Promise<ServerStatus> {
        return Promise.resolve({
            name: this.nameKeeper.getServerName(),
            version: CONTENT_KATALYST_VERSION,
            currentTime: Date.now(),
            lastImmutableTime: this.getLastImmutableTime()
        })
    }

    async deployEntityFromCluster(files: ContentFile[], entityId: EntityId, ethAddress: EthAddress, signature: Signature, serverName: ServerName, deploymentTimestamp: Timestamp): Promise<void> {
        await this.deployEntityWithServerAndTimestamp(files, entityId, ethAddress, signature, serverName, () => deploymentTimestamp, Validations.SYNCED)
    }

    async deployOverwrittenEntityFromCluster(entityFile: ContentFile, entityId: EntityId, ethAddress: EthAddress, signature: Signature, serverName: ServerName, deploymentTimestamp: Timestamp): Promise<void> {
        await this.deployEntityWithServerAndTimestamp([entityFile], entityId, ethAddress, signature, serverName, () => deploymentTimestamp, Validations.OVERWRITE)
    }

    async deployEntityWithBlacklistedContent(files: ContentFile[], entityId: EntityId, ethAddress: EthAddress, signature: Signature, serverName: ServerName, deploymentTimestamp: Timestamp): Promise<void> {
        await this.deployEntityWithServerAndTimestamp(files, entityId, ethAddress, signature, serverName, () => deploymentTimestamp, Validations.BLACKLISTED_CONTENT)
    }

    async deployEntityWithBlacklistedEntity(entityFile: ContentFile, entityId: EntityId, ethAddress: EthAddress, signature: Signature, serverName: ServerName, deploymentTimestamp: Timestamp): Promise<void> {
        await this.deployEntityWithServerAndTimestamp([entityFile], entityId, ethAddress, signature, serverName, () => deploymentTimestamp, Validations.BLACKLISTED_ENTITY)
    }

    async setImmutableTime(immutableTime: number): Promise<void> {
        this.lastImmutableTime = immutableTime
        await Promise.all([this.historyManager.setTimeAsImmutable(immutableTime), this.pointerManager.setTimeAsImmutable(immutableTime)])
    }

    private async isEntityAlreadyDeployed(entityId: EntityId) {
        const entityIdDeployed = await this.isContentAvailable([entityId]);
        return entityIdDeployed.get(entityId)
    }

    getLastImmutableTime(): Timestamp {
        return this.lastImmutableTime
    }

}
