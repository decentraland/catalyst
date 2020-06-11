import log4js from "log4js"
import { ContentFileHash, Hashing } from "./Hashing";
import { EntityType, Pointer, EntityId, Entity } from "./Entity";
import { MetaverseContentService, ENTITY_FILE_NAME, ContentFile, ServerStatus, TimeKeepingService, ClusterDeploymentsService } from "./Service";
import { Timestamp, happenedBeforeEntities } from "./time/TimeSorting";
import { EntityFactory } from "./EntityFactory";
import { HistoryManager } from "./history/HistoryManager";
import { ServerName } from "./naming/NameKeeper";
import { DeploymentReporter } from "./reporters/DeploymentReporter";
import { PointerManager } from "./pointers/PointerManager";
import { ServiceStorage } from "./ServiceStorage";
import { AuditInfo, AuditInfoExternal, AuditInfoBase } from "./Audit";
import { CURRENT_CONTENT_VERSION } from "../Environment";
import { Validations } from "./validations/Validations";
import { ValidationContext } from "./validations/ValidationContext";
import { ContentAuthenticator } from "./auth/Authenticator";
import { ContentItem } from "../storage/ContentStorage";
import { FailedDeploymentsManager, FailureReason } from "./errors/FailedDeploymentsManager";
import { IdentityProvider } from "./synchronization/ContentCluster";
import { Repository, RepositoryTask } from "../storage/Repository";
import { ServerAddress } from "./synchronization/clients/contentserver/ContentServerClient";
import { DeploymentManager, PartialDeploymentHistory, DeploymentFilters, DeploymentDelta } from "./deployments/DeploymentManager";

export class ServiceImpl implements MetaverseContentService, TimeKeepingService, ClusterDeploymentsService {

    private static readonly LOGGER = log4js.getLogger('ServiceImpl');
    private static readonly DEFAULT_SERVER_NAME = 'NOT_IN_DAO'

    constructor(
        private readonly storage: ServiceStorage,
        private readonly historyManager: HistoryManager,
        private readonly pointerManager: PointerManager,
        private readonly identityProvider: IdentityProvider,
        private readonly deploymentReporter: DeploymentReporter,
        private readonly failedDeploymentsManager: FailedDeploymentsManager,
        private readonly deploymentManager: DeploymentManager,
        private readonly validations: Validations,
        private readonly repository: Repository,
        private readonly allowDeploymentsWhenNotInDAO: boolean = false) {
    }

    async getEntitiesByPointers(type: EntityType, pointers: Pointer[], repository: RepositoryTask | Repository = this.repository): Promise<Entity[]> {
        const lowerCase = pointers.map((pointer: Pointer) => pointer.toLocaleLowerCase())
        return repository.taskIf(async task => {
            const entityIds = await this.pointerManager.getActiveEntitiesInPointers(task.lastDeployedPointers, type, lowerCase);
            return this.getEntitiesByIds(type, entityIds, task)
        })
    }

    async getEntitiesByIds(type: EntityType, ids: EntityId[], repository: RepositoryTask | Repository = this.repository): Promise<Entity[]> {
        const idsWithoutDuplicates = ids.filter((elem, pos, array) => array.indexOf(elem) == pos)
        return repository.taskIf(task => this.deploymentManager.getEntitiesByIds(task.deployments, task.content, type, idsWithoutDuplicates))
    }

    deployEntity(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfoBase, origin: string, repository: RepositoryTask | Repository = this.repository): Promise<Timestamp> {
        if (!this.allowDeploymentsWhenNotInDAO && !this.identityProvider.getIdentityInDAO()) {
            throw new Error(`Deployments are not allow since server is not in DAO`)
        }
        return this.deployInternal(files, entityId, auditInfo, ValidationContext.LOCAL, origin, repository)
    }

    deployToFix(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfoBase, origin: string, repository: RepositoryTask | Repository = this.repository): Promise<Timestamp> {
        return this.deployInternal(files, entityId, auditInfo, ValidationContext.FIX_ATTEMPT, origin, repository, true)
    }

    deployLocalLegacy(files: ContentFile[], entityId: string, auditInfo: AuditInfoBase, repository: RepositoryTask | Repository = this.repository): Promise<number> {
        if (!this.allowDeploymentsWhenNotInDAO && !this.identityProvider.getIdentityInDAO()) {
            throw new Error(`Deployments are not allow since server is not in DAO`)
        }
        return this.deployInternal(files, entityId, auditInfo, ValidationContext.LOCAL_LEGACY_ENTITY, 'legacy', repository)
    }

    private async deployInternal(files: ContentFile[],
        entityId: EntityId,
        auditInfo: AuditInfoExternal | AuditInfoBase,
        validationContext: ValidationContext,
        origin: string,
        repository: RepositoryTask | Repository = this.repository,
        fix: boolean = false): Promise<Timestamp> {
        const validation = this.validations.getInstance()

        // Find entity file and make sure its hash is the expected
        const entityFile: ContentFile = ServiceImpl.findEntityFile(files)
        const entityFileHash = await Hashing.calculateHash(entityFile);
        validation.validateEntityHash(entityId, entityFileHash, validationContext)

        // Parse entity file into an Entity
        const entity: Entity = EntityFactory.fromFile(entityFile, entityId)

        // Validate signature
        await validation.validateSignature(entityId, entity.timestamp, auditInfo.authChain, validationContext)

        // Validate entity
        validation.validateEntity(entity, validationContext)

        // Validate that the entity is recent
        validation.validateDeploymentIsRecent(entity, validationContext)

        // Calculate the owner address from the auth chain
        const ownerAddress = ContentAuthenticator.ownerAddress(auditInfo.authChain)

        // Validate that Decentraland performed the deployment (only for legacy entities)
        validation.validateDecentralandAddress(ownerAddress, validationContext)

        // Validate request size
        validation.validateRequestSize(files, entity.pointers, validationContext)

        // Validate ethAddress access
        await validation.validateAccess(entity.type, entity.pointers, entity.timestamp, ownerAddress, validationContext)

        // Hash all files, and validate them
        const hashes: Map<ContentFileHash, ContentFile> = await Hashing.calculateHashes(files)

        // Check for if content is already stored
        const alreadyStoredContent: Map<ContentFileHash, boolean> = await this.isContentAvailable(Array.from(entity.content?.values() ?? []));

        // Validate the entity's content property
        validation.validateContent(entity, hashes, alreadyStoredContent, validationContext)

        return repository.txIf(async transaction => {
            // Validate if the entity can be re deployed
            await validation.validateThatEntityCanBeRedeployed(entity, entityId => this.isEntityAlreadyDeployed(entityId, transaction), validationContext)

            // Validate that there is no entity with a higher version
            await validation.validateLegacyEntity(entity, auditInfo, (type, pointers) => this.getEntitiesByPointers(type, pointers, transaction), (type, id) => this.getAuditInfo(type, id, transaction), validationContext)

            // Validate that there are no newer entities on pointers
            await validation.validateNoNewerEntitiesOnPointers(entity, (entity: Entity) => this.areThereNewerEntitiesOnPointers(entity, transaction), validationContext)

            // Validate that if the entity was already deployed, the status it was left is what we expect
            await validation.validateThatEntityFailedBefore(entity, (type, id) => this.failedDeploymentsManager.getDeploymentStatus(transaction.failedDeployments, type, id), validationContext)

            if (validation.getErrors().length > 0) {
                throw new Error(validation.getErrors().join('\n'))
            }

            // IF THIS POINT WAS REACHED, THEN THE DEPLOYMENT WILL BE COMMITTED

            const localTimestamp = Date.now()
            let auditInfoComplete: AuditInfo;

            if (fix) {
                const failedDeployment = (await this.failedDeploymentsManager.getFailedDeployment(transaction.failedDeployments, entity.type, entity.id))!!
                auditInfoComplete = {
                    ...auditInfo,
                    originTimestamp: failedDeployment.originTimestamp,
                    originServerUrl: failedDeployment.originServerUrl,
                    localTimestamp,
                }
            } else {
                auditInfoComplete = {
                    originTimestamp: localTimestamp,
                    originServerUrl: this.identityProvider.getIdentityInDAO()?.address ?? 'https://peer.decentraland.org/content',
                    ...auditInfo,
                    localTimestamp,
                }
            }

            // Calculate overwrites
            const { overwrote, overwrittenBy } = await this.pointerManager.calculateOverwrites(transaction.pointerHistory, entity)

            // Store the deployment
            const deploymentId = await this.deploymentManager.saveDeployment(transaction.deployments, transaction.migrationData, transaction.content, entity, auditInfoComplete, overwrittenBy)

            // Modify active pointers
            const result = await this.pointerManager.referenceEntityFromPointers(transaction.lastDeployedPointers, deploymentId, entity)

            // Save deployment delta
            await this.deploymentManager.saveDelta(transaction.deploymentDeltas, deploymentId, result)

            // Add to pointer history
            await this.pointerManager.addToHistory(transaction.pointerHistory, deploymentId, entity)

            // Set who overwrote who
            await this.deploymentManager.setEntitiesAsOverwritten(transaction.deployments, overwrote, deploymentId)

            // Mark deployment as successful (this does nothing it if hadn't failed on the first place)
            await this.failedDeploymentsManager.reportSuccessfulDeployment(transaction.failedDeployments, entity.type, entity.id)

            // Store the entity's content
            await this.storeEntityContent(hashes, alreadyStoredContent)

            // Since we are still reporting the history size, add one to it
            await this.historyManager.reportDeployment(transaction.deployments)

            // Record deployment for analytics
            this.deploymentReporter.reportDeployment(entity, ownerAddress, origin)

            return auditInfoComplete.localTimestamp
        })
    }

    reportErrorDuringSync(entityType: EntityType, entityId: EntityId, originTimestamp: Timestamp, originServerUrl: ServerAddress, reason: FailureReason, errorDescription?: string): Promise<null> {
        ServiceImpl.LOGGER.warn(`Deployment of entity (${entityType}, ${entityId}) failed. Reason was: '${reason}'`)
        return this.failedDeploymentsManager.reportFailure(this.repository.failedDeployments, entityType, entityId, originTimestamp, originServerUrl, reason, errorDescription)
    }

    /** Check if there are newer entities on the given entity's pointers */
    private async areThereNewerEntitiesOnPointers(entity: Entity, transaction: RepositoryTask): Promise<boolean> {
        // Validate that pointers aren't referring to an entity with a higher timestamp
        const currentPointedEntities = await this.getEntitiesByPointers(entity.type, entity.pointers, transaction)
        for (const currentEntity of currentPointedEntities) {
            if (happenedBeforeEntities(entity, currentEntity)) {
                return true
            }
        }
        return false
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

    getContent(fileHash: ContentFileHash): Promise<ContentItem | undefined> {
        return this.storage.getContent(fileHash);
    }

    async getAuditInfo(type: EntityType, id: EntityId, repository: RepositoryTask | Repository = this.repository): Promise<AuditInfo | undefined> {
        return repository.taskIf(task => this.deploymentManager.getAuditInfo(task.deployments, task.migrationData, type, id))
    }

    isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>> {
        return this.storage.isContentAvailable(fileHashes)
    }

    getStatus(): ServerStatus {
        return {
            name: this.getOwnName(),
            version: CURRENT_CONTENT_VERSION,
            currentTime: Date.now(),
            lastImmutableTime: this.historyManager.getLastImmutableTime(),
            historySize: this.historyManager.getHistorySize(),
        }
    }

    deleteContent(fileHashes: string[]): Promise<void> {
        return this.storage.deleteContent(fileHashes)
    }

    async deployEntityFromCluster(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfoExternal): Promise<void> {
        const legacy = !!auditInfo.originalMetadata
        await this.deployInternal(files, entityId, auditInfo, legacy ? ValidationContext.SYNCED_LEGACY_ENTITY : ValidationContext.SYNCED, 'sync')
    }

    async deployOverwrittenEntityFromCluster(entityFile: ContentFile, entityId: EntityId, auditInfo: AuditInfoExternal): Promise<void> {
        const legacy = !!auditInfo.originalMetadata
        await this.deployInternal([entityFile], entityId, auditInfo, legacy ? ValidationContext.OVERWRITTEN_LEGACY_ENTITY : ValidationContext.OVERWRITTEN, 'sync')
    }

    setImmutableTime(immutableTime: number): void {
        this.historyManager.setTimeAsImmutable(immutableTime)
    }

    areEntitiesAlreadyDeployed(entityIds: EntityId[], repository: RepositoryTask | Repository = this.repository): Promise<Map<EntityId, boolean>> {
        return this.deploymentManager.areEntitiesDeployed(repository.deployments, entityIds)
    }

    getLegacyHistory(from?: Timestamp, to?: Timestamp, serverName?: ServerName, offset?: number, limit?: number) {
        return this.historyManager.getHistory(this.repository.deployments, from, to, serverName, offset, limit)
    }

    getDeployments(filters?: DeploymentFilters, offset?: number, limit?: number, repository: RepositoryTask | Repository = this.repository): Promise<PartialDeploymentHistory> {
        return repository.taskIf(task => this.deploymentManager.getDeployments(task.deployments, task.content, task.migrationData, filters, offset, limit))
    }

    getDeltas(repository: RepositoryTask | Repository = this.repository): Promise<DeploymentDelta[]> {
        return repository.taskIf(task => this.deploymentManager.getDeltas(task.deploymentDeltas, task.deployments))
    }

    getAllFailedDeployments() {
        return this.failedDeploymentsManager.getAllFailedDeployments(this.repository.failedDeployments)
    }

    private async isEntityAlreadyDeployed(entityId: EntityId, transaction: RepositoryTask): Promise<boolean> {
        const result = await this.areEntitiesAlreadyDeployed([entityId], transaction)
        return result.get(entityId)!!
    }

    private getOwnName(): ServerName {
        return this.identityProvider.getIdentityInDAO()?.name ?? ServiceImpl.DEFAULT_SERVER_NAME
    }

}
