import { DeploymentEvent, DeploymentHistory } from "../history/HistoryManager";
import { ContentServerClient } from "./clients/contentserver/ContentServerClient";
import { Entity, EntityId } from "../Entity";
import { ContentFileHash } from "../Hashing";
import { ENTITY_FILE_NAME, ContentFile, ClusterDeploymentsService } from "../Service";
import { ContentCluster } from "./ContentCluster";
import { AuditInfo } from "../audit/Audit";
import { tryOnCluster } from "./ClusterUtils";
import { EntityFactory } from "../EntityFactory";
import { sortFromOldestToNewest } from "../time/TimeSorting";

export class EventDeployer {

    static readonly DEPLOYMENT_CHUNK_SIZE = 15
    static readonly BLACKLISTED_ON_CLUSTER_METADATA: string = "This entity was blacklisted on all other servers on the cluster, so we couldn't retrieve it properly."

    constructor(private readonly cluster: ContentCluster,
        private readonly service: ClusterDeploymentsService) { }

    deployHistories(histories: DeploymentHistory[]) {
        // Remove duplicates
        const map: Map<EntityId, DeploymentEvent> = new Map()
        histories.forEach(history => history.forEach(event => map.set(event.entityId, event)))

        // Unify
        const unifiedHistory = Array.from(map.values())

        // Deploy
        return this.deployHistory(unifiedHistory)
    }

    async deployHistory(history: DeploymentHistory, source?: ContentServerClient) {
        // Determine whether I already know the entities
        const entitiesInHistory: EntityId[] = history.map(({ entityId }) => entityId)
        const newEntities: EntityId[] = await this.filterOutKnownFiles(entitiesInHistory)

        // Keep and sort new deployments
        const newDeployments = sortFromOldestToNewest(history.filter(event => newEntities.includes(event.entityId)))

        // Deploy all
        for (const newDeployment of newDeployments) {
            await this.prepareDeployment(newDeployment, source)
        }
    }

    /**
     * This method is pretty similar to 'deployHistory'. In this case, the bootstrapping process continues, even if one of the deployments fails.
     */
    async bootstrapWithHistory(history: DeploymentHistory) {
        // Determine whether I already know the entities
        const entitiesInHistory: EntityId[] = history.map(({ entityId }) => entityId)
        const newEntities: EntityId[] = await this.filterOutKnownFiles(entitiesInHistory)

        // Keep and sort new deployments
        const newDeployments = sortFromOldestToNewest(history.filter(event => newEntities.includes(event.entityId)))
        console.log(`Found a history of size ${history.length} to bootstrap with. Only ${newDeployments.length} are new and will be deployed`)


        let i = 0;
        for (const events of this.splitInChunks(newDeployments, EventDeployer.DEPLOYMENT_CHUNK_SIZE)) {
            // Prepare all deployments
            const preparedDeployments = await Promise.all(events.map(event => this.prepareDeployment(event)));

            // Deploy each entity
            preparedDeployments.forEach(preparedDeployment => preparedDeployment())

            // Report
            i = Math.min(i + EventDeployer.DEPLOYMENT_CHUNK_SIZE, newDeployments.length)
            console.log(`Deployed ${i}/${newDeployments.length} already.`)
        }
    }

    private splitInChunks<T>(array: T[], chunkSize: number) {
        const result: T[][] = [];
        for (let i = 0; i < array.length; i += chunkSize)
            result.push(array.slice(i, i + chunkSize));
        return result;
    }

    /** Download and prepare everything necessary to deploy an entity */
    private async prepareDeployment(deployment: DeploymentEvent, source?: ContentServerClient): Promise<() => Promise<void>> {
        // Download the entity file
        const entityFile: ContentFile | undefined = await this.getEntityFile(deployment, source);

        // Get the audit info
        const auditInfo = await this.getAuditInfo(deployment, source)

        if (entityFile) {
            // If entity file was retrieved, we know that the entity wasn't blacklisted
            if (auditInfo.overwrittenBy) {
                // Deploy the entity as overwritten
                return () => this.service.deployOverwrittenEntityFromCluster(entityFile, deployment.entityId, auditInfo, deployment.serverName)
            } else {
                // Download all entity's files
                const files: (ContentFile | undefined)[] = await this.getContentFiles(deployment, entityFile, source)

                // Add the entity file to the list of files
                files.unshift(entityFile)

                // Keep only defined files
                const definedFiles: ContentFile[] = files.filter((file): file is ContentFile => !!file)

                if (definedFiles.length == files.length) {
                    // Since there was no blacklisted files, deploy the new entity normally
                    return () => this.service.deployEntityFromCluster(definedFiles, deployment.entityId, auditInfo, deployment.serverName)
                } else {
                    // It looks like there was a blacklisted content
                    return () => this.service.deployEntityWithBlacklistedContent(definedFiles, deployment.entityId, auditInfo, deployment.serverName)
                }
            }
        } else {
            // It looks like the entity was blacklisted
            const entity: Entity = await this.getEntity(deployment, source);

            const serializableEntity = {
                id: entity.id,
                type: entity.type,
                pointers: entity.pointers,
                timestamp: entity.timestamp,
                metadata: EventDeployer.BLACKLISTED_ON_CLUSTER_METADATA,
            }

            // Build a new entity file, based on the sanitized entity
            const entityFile: ContentFile = { name: ENTITY_FILE_NAME, content: Buffer.from(JSON.stringify(serializableEntity)) }

            // Deploy the entity file
            return () => this.service.deployEntityWithBlacklistedEntity(entityFile, deployment.entityId, auditInfo, deployment.serverName)
        }
    }

    /**
     * Get all the files needed to deploy the new entity
     */
    private async getContentFiles(deployment: DeploymentEvent, entityFile: ContentFile, source?: ContentServerClient): Promise<(ContentFile | undefined)[]> {
        // Retrieve the entity from the server
        const entity: Entity = EntityFactory.fromFile(entityFile, deployment.entityId)

        // Read the entity, and get all content file hashes
        const allFileHashes: ContentFileHash[] = Array.from(entity.content?.values() ?? [])

        // Download all content files that we don't currently have
        const filePromises: Promise<ContentFile | undefined>[] = (await this.filterOutKnownFiles(allFileHashes))
            .map(fileHash => this.getContentFile(deployment, fileHash, source))

        // Return all the downloaded files
        return Promise.all(filePromises)
    }

    private async getEntityFile(deployment: DeploymentEvent, source?: ContentServerClient): Promise<ContentFile | undefined> {
        const file: ContentFile | undefined = await this.getFileOrUndefinedIfBlacklisted(deployment,
            deployment.entityId,
            auditInfo => !!auditInfo.isBlacklisted,
            source)

        // If we could download the entity file, rename it
        if (file) {
            file.name = ENTITY_FILE_NAME
        }
        return file
    }

    private getContentFile(deployment: DeploymentEvent, fileHash: ContentFileHash, source?: ContentServerClient): Promise<ContentFile | undefined> {
        return this.getFileOrUndefinedIfBlacklisted(deployment,
            fileHash,
            auditInfo => !!auditInfo.blacklistedContent && auditInfo.blacklistedContent.includes(fileHash),
            source)
    }

    /**
     * This method tries to get a file from the other servers on the DAO. If all the request fail, then it checks if the file is blacklisted.
     * If it is, then it returns 'undefined'. If it isn;t, then it throws an exception.
     */
    private async getFileOrUndefinedIfBlacklisted(deployment: DeploymentEvent, fileHash: ContentFileHash, checkIfBlacklisted: (auditInfo: AuditInfo) => boolean, source?: ContentServerClient): Promise<ContentFile | undefined> {
        try {
            return await tryOnCluster(server => server.getContentFile(fileHash), this.cluster, source)
        } catch (error) {
            // If we reach this point, then no other server on the DAO could give us the file we are looking for. Maybe it's been blacklisted?
            const auditInfo: AuditInfo = await this.getAuditInfo(deployment, source)

            // Check if the content is blacklisted
            const isBlacklisted: boolean = checkIfBlacklisted(auditInfo)

            if (!isBlacklisted) {
                throw new Error(`Couldn't get file ${fileHash} from any other server on the DAO, but is isn't blacklisted`)
            } else {
                return undefined
            }
        }
    }

    private getEntity(deployment: DeploymentEvent, source: ContentServerClient | undefined): Promise<Entity> {
        return tryOnCluster(server => server.getEntity(deployment.entityType, deployment.entityId), this.cluster, source);
    }

    private getAuditInfo(deployment: DeploymentEvent, source?: ContentServerClient): Promise<AuditInfo> {
        return tryOnCluster(server => server.getAuditInfo(deployment.entityType, deployment.entityId), this.cluster, source)
    }

    private async filterOutKnownFiles(hashes: ContentFileHash[]): Promise<ContentFileHash[]> {
        // Check if we already have any of the files
        const availableContent: Map<ContentFileHash, Boolean> = await this.service.isContentAvailable(hashes)

        // Filter out files that we already have
        return Array.from(availableContent.entries())
            .filter(([_, isAlreadyAvailable]) => !isAlreadyAvailable)
            .map(([fileHash, _]) => fileHash)
    }

}