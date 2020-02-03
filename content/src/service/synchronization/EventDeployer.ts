import { DeploymentEvent, DeploymentHistory } from "../history/HistoryManager";
import { ContentServerClient } from "./clients/contentserver/ContentServerClient";
import { Entity, EntityId } from "../Entity";
import { ContentFileHash } from "../Hashing";
import { ENTITY_FILE_NAME, ContentFile, ClusterDeploymentsService } from "../Service";
import { ContentCluster } from "./ContentCluster";
import { AuditInfo } from "../audit/Audit";
import { tryOnCluster } from "./ClusterUtils";
import { EntityFactory } from "../EntityFactory";
import { EventStreamProcessor } from "./EventStreamProcessor";
import { FailedDeploymentsManager, FailureReason } from "../errors/FailedDeploymentsManager";

export class EventDeployer {

    static readonly FETCH_ERROR_METADATA: string = "There was a problem when fetching the files for this entity. It could be due to blacklisting, or network problems."
    private readonly eventProcessor: EventStreamProcessor

    constructor(private readonly cluster: ContentCluster,
        private readonly service: ClusterDeploymentsService,
        private readonly failedDeploymentsManager: FailedDeploymentsManager) {
            this.eventProcessor = new EventStreamProcessor((event, source) => this.wrapDeployment(this.prepareDeployment(event, source)))
        }

    deployHistories(histories: DeploymentHistory[]) {
        // Remove duplicates
        const map: Map<EntityId, DeploymentEvent> = new Map()
        histories.forEach(history => history.forEach(event => map.set(event.entityId, event)))

        // Unify
        const unifiedHistory = Array.from(map.values())

        // Deploy
        return this.deployHistory(unifiedHistory)
    }

    async deployHistory(history: DeploymentHistory, options?: HistoryDeploymentOptions) {
        // Determine whether I already know the entities
        const entitiesInHistory: EntityId[] = history.map(({ entityId }) => entityId)
        const newEntities: Set<EntityId> = new Set(await this.filterOutKnownFiles(entitiesInHistory))

        // Keep only new deployments
        const newDeployments = history.filter(event => newEntities.has(event.entityId));

        if (options?.logging) {
            console.log(`History had ${history.length} entities, only ${newDeployments.length} new.`)
        }

        // Process history and deploy it
        return this.eventProcessor.deployHistory(newDeployments, options)
    }

    /** Download and prepare everything necessary to deploy an entity */
    private async prepareDeployment(deployment: DeploymentEvent, source?: ContentServerClient): Promise<DeploymentExecution> {
        // Download the entity file
        const entityFile: ContentFile | undefined = await this.getEntityFile(deployment, source);

        // Get the audit info
        const auditInfo: AuditInfo | undefined = await this.getAuditInfo(deployment, source)

        if (entityFile && auditInfo) {
            if (auditInfo.overwrittenBy) {
                // Deploy the entity as overwritten
                return this.buildDeploymentExecution(entityFile, auditInfo, deployment, () => this.service.deployOverwrittenEntityFromCluster(entityFile, deployment.entityId, auditInfo, deployment.serverName))
            } else {
                // Build entity
                const entity: Entity = EntityFactory.fromFile(entityFile, deployment.entityId)

                // Download all entity's files
                const files: (ContentFile | undefined)[] = await this.getContentFiles(entity, source)

                // Add the entity file to the list of files
                files.unshift(entityFile)

                // Keep only defined files
                const definedFiles: ContentFile[] = files.filter((file): file is ContentFile => !!file)

                if (definedFiles.length === files.length) {
                    // Since we could fetch all files, deploy the new entity normally
                    return this.buildDeploymentExecution(entityFile, auditInfo, deployment, () => this.service.deployEntityFromCluster(definedFiles, deployment.entityId, auditInfo, deployment.serverName))
                } else {
                    // Looks like there was a problem fetching one of the files
                    return this.buildDeploymentForError(entity, auditInfo, deployment)
                }
            }
        } else if (!auditInfo) {
            await this.failedDeploymentsManager.reportFailedDeployment(deployment, FailureReason.NO_ENTITY_OR_AUDIT)
            throw new Error('Failed to find fetch the audit info')
        } else {
            // It looks like we could fetch the audit info, but not the entity file. We will try to generate it by looking at the entity
            const entity: Entity | undefined = await this.getEntity(deployment, source);

            if (!entity) {
                await this.failedDeploymentsManager.reportFailedDeployment(deployment, FailureReason.NO_ENTITY_OR_AUDIT)
                throw new Error('Failed to find fetch both the entity file and the entity itself')
            } else {
                // Deploy the entity file
                return this.buildDeploymentForError(entity, auditInfo, deployment)
            }
        }
    }

    /**
     * Get all the files needed to deploy the new entity
     */
    private async getContentFiles(entity: Entity, source?: ContentServerClient): Promise<(ContentFile | undefined)[]> {
        // Read the entity, and get all content file hashes
        const allFileHashes: ContentFileHash[] = Array.from(entity.content?.values() ?? [])

        // Download all content files that we don't currently have
        const filePromises: Promise<ContentFile | undefined>[] = (await this.filterOutKnownFiles(allFileHashes))
            .map(fileHash => this.getFileOrUndefined(fileHash, source))

        // Return all the downloaded files
        return Promise.all(filePromises)
    }

    private async getEntityFile(deployment: DeploymentEvent, source?: ContentServerClient): Promise<ContentFile | undefined> {
        const file: ContentFile | undefined = await this.getFileOrUndefined(deployment.entityId, source)

        // If we could download the entity file, rename it
        if (file) {
            file.name = ENTITY_FILE_NAME
        }
        return file
    }

    /**
     * This method tries to get a file from the other servers on the DAO. If all the request fail, then it returns 'undefined'.
     */
    private getFileOrUndefined(fileHash: ContentFileHash, source?: ContentServerClient): Promise<ContentFile | undefined> {
        return this.tryOnClusterOrUndefined(server => server.getContentFile(fileHash), this.cluster, { preferred: source })
    }

    private getEntity(deployment: DeploymentEvent, source: ContentServerClient | undefined): Promise<Entity | undefined> {
        return this.tryOnClusterOrUndefined(server => server.getEntity(deployment.entityType, deployment.entityId), this.cluster, { preferred: source });
    }

    private getAuditInfo(deployment: DeploymentEvent, source?: ContentServerClient): Promise<AuditInfo | undefined> {
        return this.tryOnClusterOrUndefined(server => server.getAuditInfo(deployment.entityType, deployment.entityId), this.cluster, { preferred: source })
    }

    private async filterOutKnownFiles(hashes: ContentFileHash[]): Promise<ContentFileHash[]> {
        // Check if we already have any of the files
        const availableContent: Map<ContentFileHash, Boolean> = await this.service.isContentAvailable(hashes)

        // Filter out files that we already have
        return Array.from(availableContent.entries())
            .filter(([_, isAlreadyAvailable]) => !isAlreadyAvailable)
            .map(([fileHash, _]) => fileHash)
    }

    private buildDeploymentForError(entity: Entity, auditInfo: AuditInfo, deploymentEvent: DeploymentEvent): DeploymentExecution {
        const serializableEntity = {
            id: entity.id,
            type: entity.type,
            pointers: entity.pointers,
            timestamp: entity.timestamp,
            metadata: EventDeployer.FETCH_ERROR_METADATA,
        }

        // Build a new entity file, based on the sanitized entity
        const entityFile: ContentFile = { name: ENTITY_FILE_NAME, content: Buffer.from(JSON.stringify(serializableEntity)) }
        return this.buildDeploymentExecution(entityFile, auditInfo, deploymentEvent, () => this.service.deployEntityWithErrorDuringSync(entityFile, deploymentEvent.entityId, auditInfo, deploymentEvent.serverName))
    }

    private buildDeploymentExecution(entityFile: ContentFile, auditInfo: AuditInfo, deploymentEvent: DeploymentEvent, execution: () => Promise<void>): DeploymentExecution {
        return {
            metadata: {
                entityFile,
                auditInfo,
                deploymentEvent,
            },
            execution,
        }
    }

     /** Wrap the deployment, so if it fails, we can take action */
     private async wrapDeployment(deploymentPreparation: Promise<DeploymentExecution>): Promise<() => Promise<void>> {
        const deploymentExecution = await deploymentPreparation
        return async () => {
            try {
                await deploymentExecution.execution()
            } catch (error) {
                console.log(`Something failed. Will store and empty entity. Error was: \n${error}`)
                const { entityFile, deploymentEvent, auditInfo } = deploymentExecution.metadata
                // The deployment failed, so we report it
                await this.failedDeploymentsManager.reportFailedDeployment(deploymentEvent, FailureReason.DEPLOYMENT_ERROR)

                // Re-deploy, but marking as an error
                return this.service.deployEntityWithErrorDuringSync(entityFile, deploymentEvent.entityId, auditInfo, deploymentEvent.serverName)
            }
        }
    }

    /** Execute an operation on the cluster, but return 'undefined' if it fails */
    private async tryOnClusterOrUndefined<T>(execution: (server: ContentServerClient) => Promise<T>, cluster: ContentCluster, options?: { retries?: number, preferred?: ContentServerClient}): Promise<T | undefined> {
        try {
            return await tryOnCluster(execution, cluster, options)
        } catch (error) {
            return undefined
        }
    }
}

export type DeploymentExecution = {
    metadata: {
        entityFile: ContentFile,
        auditInfo: AuditInfo,
        deploymentEvent: DeploymentEvent
    },
    execution: () => Promise<void>,
}

export type HistoryDeploymentOptions = {
    logging?: boolean,
    continueOnFailure?: boolean,
    preferredServer?: ContentServerClient
}