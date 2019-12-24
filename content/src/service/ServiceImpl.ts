import Cache from "caching-map"
import { FileHash, Hashing } from "./Hashing";
import { EntityType, Pointer, EntityId, Entity } from "./Entity";
import { Validation } from "./Validation";
import { MetaverseContentService, EthAddress, Signature, Timestamp, ENTITY_FILE_NAME, AuditInfo, File, ServerStatus, ClusterAwareService } from "./Service";
import { EntityFactory } from "./EntityFactory";
import { HistoryManager, DeploymentHistory } from "./history/HistoryManager";
import { NameKeeper, ServerName } from "./naming/NameKeeper";
import { ContentAnalytics } from "./analytics/ContentAnalytics";
import { PointerManager, CommitResult } from "./pointers/PointerManager";
import { AccessChecker } from "./AccessChecker";
import { ServiceStorage } from "./ServiceStorage";

export class ServiceImpl implements MetaverseContentService, ClusterAwareService {

    private entities: Cache = new Cache(1000)
    private lastImmutableTime: Timestamp = 0

    constructor(
        private storage: ServiceStorage,
        private historyManager: HistoryManager,
        private pointerManager: PointerManager,
        private nameKeeper: NameKeeper,
        private analytics: ContentAnalytics,
        private accessChecker: AccessChecker,
        private ignoreValidationErrors: boolean = false) {
        this.entities.materialize = (entityId: EntityId) => this.getEntityById(entityId)
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

    async deployEntity(files: File[], entityId: EntityId, ethAddress: EthAddress, signature: Signature): Promise<Timestamp> {
        return this.deployEntityWithServerAndTimestamp(files, entityId, ethAddress, signature, this.nameKeeper.getServerName(), Date.now, true)
    }

    // TODO: Maybe move this somewhere else?
    private async deployEntityWithServerAndTimestamp(files: File[], entityId: EntityId, ethAddress: EthAddress, signature: Signature, serverName: ServerName, timestampGenerator: () => Timestamp, checkFreshness: Boolean): Promise<Timestamp> {
        // Find entity file and make sure its hash is the expected
        const entityFile: File = this.findEntityFile(files)
        if (entityId !== await Hashing.calculateHash(entityFile)) {
            throw new Error("Entity file's hash didn't match the signed entity id.")
        }

        const validation = new Validation(this.accessChecker)
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

        if (checkFreshness) {
            // Validate that the entity is "fresh"
            await validation.validateFreshDeployment(entity, (type,pointers) => this.getEntitiesByPointers(type, pointers))
        }

        // Type validation
        validation.validateType(entity)

        // Hash all files, and validate them
        const hashes: Map<FileHash, File> = await Hashing.calculateHashes(files)
        const alreadyStoredHashes: Map<FileHash, Boolean> = await this.isContentAvailable(Array.from(hashes.keys()));
        validation.validateHashes(entity, hashes, alreadyStoredHashes)

        if (!this.ignoreValidationErrors && validation.getErrors().length > 0) {
            throw new Error(validation.getErrors().join('\n'))
        }

        // IF THIS POINT WAS REACHED, THEN THE DEPLOYMENT WILL BE COMMITED

        const commitResult: CommitResult = await this.pointerManager.tryToCommitPointers(entity);

        // Delete entities that the new deployment would overwrite
        commitResult.entitiesDeleted.forEach((entityId: EntityId) => this.entities.delete(entityId))

        // Store the entity's content
        await this.storeEntityContent(hashes, alreadyStoredHashes, entityId, commitResult.couldCommit)

        // Calculate timestamp
        const deploymentTimestamp: Timestamp = timestampGenerator()

        // Save audit information
        await this.storeAuditInfo(entityId, ethAddress, signature, deploymentTimestamp)

        // Add the new deployment to history
        await this.historyManager.newEntityDeployment(serverName, entity, deploymentTimestamp)

        // Record deployment for analytics
        this.analytics.recordDeployment(this.nameKeeper.getServerName(), entity, ethAddress)

        return Promise.resolve(deploymentTimestamp)
    }

    private storeAuditInfo(entityId: EntityId, ethAddress: EthAddress, signature: Signature, deployedTimestamp: Timestamp): Promise<void> {
         const auditInfo: AuditInfo = {
            deployedTimestamp,
            ethAddress,
            signature,
        }
        return this.storage.storeAuditInfo(entityId, auditInfo)
    }

    private async getEntityById(id: EntityId): Promise<Entity | undefined> {
        const buffer = await this.storage.getContent(id)
        return buffer ? EntityFactory.fromBufferWithId(buffer, id) : undefined
    }

    private storeEntityContent(hashes: Map<FileHash, File>, alreadyStoredHashes: Map<FileHash, Boolean>, entityId: EntityId, couldCommit: boolean): Promise<any> {
        if (couldCommit) {
            // If entity was commited, then store all it's content (that isn't already stored)
            const contentStorageActions: Promise<void>[] = Array.from(hashes.entries())
                .filter(([fileHash, file]) => !alreadyStoredHashes.get(fileHash))
                .map(([fileHash, file]) => this.storage.storeContent(fileHash, file.content))

            return Promise.all(contentStorageActions)
        } else {
            // If entity wasn't commited, then only store the entity file
            if (!alreadyStoredHashes.get(entityId)) {
                const entityFile: File = hashes.get(entityId) as File
                return this.storage.storeContent(entityId, entityFile.content)
            } else {
                return Promise.resolve()
            }
        }
    }

    private findEntityFile(files: File[]): File {
        const filesWithName = files.filter(file => file.name === ENTITY_FILE_NAME)
        if (filesWithName.length === 0) {
            throw new Error(`Failed to find the entity file. Please make sure that it is named '${ENTITY_FILE_NAME}'.`)
        } else if (filesWithName.length > 1) {
            throw new Error(`Found more than one file called '${ENTITY_FILE_NAME}'. Please make sure you upload only one with that name.`)
        }

        return filesWithName[0];
    }

    async getContent(fileHash: FileHash): Promise<Buffer> {
        const content: Buffer | undefined = await this.storage.getContent(fileHash);
        return this.assertDefined(content, `Failed to find content with the hash ${fileHash}.`)
    }

    async getAuditInfo(type: EntityType, id: EntityId): Promise<AuditInfo> {
        const auditInfo: AuditInfo | undefined = await this.storage.getAuditInfo(id);
        return this.assertDefined(auditInfo, `Failed to find the audit information for the entity with type ${type} and id ${id}.`)
    }

    async isContentAvailable(fileHashes: FileHash[]): Promise<Map<FileHash, Boolean>> {
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
            version: "1.0",
            currentTime: Date.now(),
            lastImmutableTime: this.lastImmutableTime
        })
    }

    async deployEntityFromCluster(files: File[], entityId: EntityId, ethAddress: EthAddress, signature: Signature, serverName: ServerName, deploymentTimestamp: Timestamp): Promise<void> {
        await this.deployEntityWithServerAndTimestamp(files, entityId, ethAddress, signature, serverName, () => deploymentTimestamp, false)
    }

    setImmutableTime(immutableTime: number): Promise<void> {
        this.lastImmutableTime = immutableTime
        return this.historyManager.setTimeAsImmutable(immutableTime)
    }

    async getLastKnownTimeForServer(serverName: string): Promise<Timestamp | undefined> {
        const knownServerHistory: DeploymentHistory = await this.historyManager.getHistory(undefined, undefined, serverName)
        return knownServerHistory[0]?.timestamp
    }

}
