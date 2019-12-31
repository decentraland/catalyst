import { DeploymentEvent, DeploymentHistory } from "../history/HistoryManager";
import { ContentServerClient } from "./clients/contentserver/ContentServerClient";
import { Entity, EntityId } from "../Entity";
import { FileHash } from "../Hashing";
import { ENTITY_FILE_NAME, File, ClusterDeploymentsService } from "../Service";
import { ContentCluster } from "./ContentCluster";
import { AuditInfo } from "../audit/Audit";

export class EventDeployer {

    constructor(private readonly cluster: ContentCluster,
        private readonly service: ClusterDeploymentsService) { }

    deployHistories(histories: DeploymentHistory[]) {
        // Remove duplicates
        const map: Map<EntityId, DeploymentEvent> = new Map()
        histories.forEach(history => history.forEach(event => map.set(event.entityId, event)))

        // Unify and sort
        const unifiedHistory = Array.from(map.values())
            .sort((a, b) => a.timestamp - b.timestamp) // Sorting from oldest to newest

        // Deploy
        return this.deployHistory(unifiedHistory)
    }

    async deployHistory(history: DeploymentHistory, source?: ContentServerClient) {
        // Determine whether I already know the entities
        const entitiesInHistory: EntityId[] = history.map(({ entityId }) => entityId)
        const newEntities: EntityId[] = await this.filterOutKnownFiles(entitiesInHistory)

        // Deploy only the new entities
        const deployments = history.filter(event => newEntities.includes(event.entityId))
            .map(event => this.deployEvent(event, source))

        await Promise.all(deployments)
    }

    async deployOverwrittenEvent(deployment: DeploymentEvent, auditInfo: AuditInfo, source: ContentServerClient): Promise<void> {
        // Download the entity file
        const entityFile: File = await this.getEntityFile(source, deployment);

        // Deploy the entity
        await this.service.deployOverwrittenEntityFromCluster([entityFile], deployment.entityId, auditInfo.ethAddress, auditInfo.signature, deployment.serverName, deployment.timestamp)
    }

    /** Process a specific deployment */
    async deployEvent(deployment: DeploymentEvent, source?: ContentServerClient): Promise<void> {
        // If not set, then choose a server to query
        source = source ?? this.cluster.getAllActiveServersInCluster()[0]

        // Download all entity's files
        const files: File[] = await this.getFilesFromDeployment(source, deployment)

        // Get the audit info
        const auditInfo = await source.getAuditInfo(deployment.entityType, deployment.entityId);

        // Deploy the new entity
        await this.service.deployEntityFromCluster(files, deployment.entityId, auditInfo.ethAddress, auditInfo.signature, deployment.serverName, deployment.timestamp)
    }

    /** Get all the files needed to deploy the new entity */
    private async getFilesFromDeployment(contentServer: ContentServerClient, event: DeploymentEvent): Promise<File[]> {
        // Retrieve the entity from the server
        const entity: Entity = await contentServer.getEntity(event.entityType, event.entityId)

        // Read the entity, and get all content file hashes
        const allFileHashes: FileHash[] = Array.from(entity.content?.values() ?? [])

        // Download all content files that we don't currently have
        const filePromises: Promise<File>[] = (await this.filterOutKnownFiles(allFileHashes))
            .map(fileHash => contentServer.getContentFile(fileHash))

        // Download the entity file
        const entityFile: File = await this.getEntityFile(contentServer, event);

        // Combine all files
        const contentFiles = await Promise.all(filePromises)
        contentFiles.push(entityFile)

        // Return all the downloaded files
        return contentFiles
    }

    private async getEntityFile(source: ContentServerClient, deployment: DeploymentEvent) {
        // Download the entity file and rename it
        let entityFile: File = await source.getContentFile(deployment.entityId);
        entityFile.name = ENTITY_FILE_NAME;
        return entityFile;
    }

    private async filterOutKnownFiles(hashes: FileHash[]): Promise<FileHash[]> {
        // Check if we already have any of the files
        const availableContent: Map<FileHash, Boolean> = await this.service.isContentAvailable(hashes)

        // Filter out files that we already have
        return Array.from(availableContent.entries())
            .filter(([_, isAlreadyAvailable]) => !isAlreadyAvailable)
            .map(([fileHash, _]) => fileHash)
    }

}