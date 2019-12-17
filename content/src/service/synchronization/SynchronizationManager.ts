import { setInterval, clearInterval, setImmediate } from "timers"
import { Service, Timestamp, File } from "../Service";
import { EntityId, EntityType, Entity } from "../Entity";
import { DeploymentHistory, DeploymentEvent, HistoryManager } from "../history/HistoryManager";
import { FileHash } from "../Hashing";
import { ServerName } from "../naming/Naming";

export class SynchronizationManager {

    private static UPDATE_FROM_DAO_INTERVAL: number = 5 * 60 * 1000 // 5 min
    private static SYNC_WITH_SERVERS_INTERVAL: number = 20 * 1000 // 20 secs

    private intervals: NodeJS.Timeout[];
    private contentServers: Map<ServerName, ContentServer>

    constructor(private dao: DAOClient, private historyManager: HistoryManager, private service: Service) {
        // Load node
        setImmediate(this.boot)
    }

    stop() {
        this.intervals.forEach(clearInterval)
    }

    private async boot() {
        // Get servers from the DAO
        await this.updateServersList()

        // Sync with the servers
        await this.syncWithServers()

        // Set intervals to update server list and keep in sync with other servers
        const interval1 = setInterval(this.updateServersList, SynchronizationManager.UPDATE_FROM_DAO_INTERVAL)
        const interval2 = setInterval(this.syncWithServers, SynchronizationManager.SYNC_WITH_SERVERS_INTERVAL)
        this.intervals = [interval1, interval2]
    }

    private async syncWithServers(): Promise<void> {
        // Gather all servers
        const contentServers: ContentServer[] = Array.from(this.contentServers.values())

        // Get new entities and process new deployments
        const updateActions: Promise<void>[] = contentServers.map(this.getNewEntitiesDeployedInContentServer)
        await Promise.all(updateActions)

        // Find the minimum timestamp between all servers
        const minTimestamp: Timestamp = Math.min(...contentServers.map(contentServer => contentServer.lastKnownTimestamp))

        // Set this new minimum timestamp as the latest immutable time
        await this.historyManager.setTimeAsImmutable(minTimestamp)
    }

    /** Get all updates from one specific content server */
    private async getNewEntitiesDeployedInContentServer(contentServer: ContentServer): Promise<void> {
        // Get new deployments on a specific content server
        const newDeployments: DeploymentHistory = await contentServer.getNewDeployments()

        // Get whether these entities have already been deployed or not
        const alreadyDeployedIds: Map<EntityId, Boolean> = await this.service.isContentAvailable(newDeployments.map(deployment => deployment.entityId))

        // Calculate the deployments we are not already aware of
        const unawareDeployments: DeploymentHistory = newDeployments.filter(deployment => !alreadyDeployedIds.get(deployment.entityId))

        // Process the deployments
        await Promise.all(unawareDeployments.map(this.processNewDeployment))
    }

    /** Process a specific deployment */
    private async processNewDeployment(deployment: DeploymentEvent): Promise<void> {
        // Find a server with the given name
        const contentServer: ContentServer | undefined = this.contentServers.get(deployment.serverName)
        if (contentServer) {
            // Download all entity's files
            const [, files]: [Entity, Set<File>] = await this.getFilesFromDeployment(contentServer, deployment)

            // Deploy the new entity
            // TODO: We will need to avoid certain validations that are currently on the service, so it might make sense to have a different method
            await this.service.deployEntityWithServerAndTimestamp(files, deployment.entityId, "ETH ADDRESS", "SIGNATURE", contentServer.name, () => deployment.timestamp)
        } else {
            throw new Error(`Failed to find a whitelisted server with the name ${deployment.serverName}`)
        }
    }

    /** Get all the files needed to deploy the new entity */
    private async getFilesFromDeployment(contentServer: ContentServer, event: DeploymentEvent): Promise<[Entity, Set<File>]> {
        // Retrieve the entity from the server
        const entity: Entity = await contentServer.getEntity(event.entityType, event.entityId)

        // Read the entity, and combine all file hashes
        const allFileHashes: FileHash[] = Array.from(entity.content?.values() ?? []).concat(entity.id)

        // Check if we already have any of the files
        const avaliableContent: Map<FileHash, Boolean> = await this.service.isContentAvailable(allFileHashes)

        // Download all files that we don't currently have
        const filePromises: Promise<File>[] = Array.from(avaliableContent.entries())
            .filter(([_, isAlreadyAvailable]) => !isAlreadyAvailable)
            .map(([fileHash, _]) => contentServer.getContentFile(fileHash))

        // Return all the downloaded files
        return [entity, new Set(await Promise.all(filePromises))]
    }


    /** Update our data with the DAO's servers list */
    private async updateServersList() {
        // Get all servers from the DAO
        const serversInDAO: ContentServer[] = await this.dao.getAllServers()

        // Store new servers
        const newServers = serversInDAO.filter(server => !this.contentServers.has(server.name));
        for (const server of newServers) {
            // Store the new server
            this.contentServers.set(server.name, server)

            // Check if we already knew something about the server
            const knownServerHistory: DeploymentHistory = await this.historyManager.getHistory(undefined, undefined, server.name);

            if (knownServerHistory.length > 0) {
                // If we did, then set the last known timestamp to the one we know about
                server.lastKnownTimestamp = knownServerHistory[0].timestamp
            }
        }

        // Delete servers that were removed from the DAO
        const serverNamesInDAO: Set<ServerName> = new Set(serversInDAO.map(server => server.name))
        Array.from(this.contentServers.keys())
            .filter(serverName => !serverNamesInDAO.has(serverName))
            .forEach(serverName => this.contentServers.delete(serverName))
    }

}

class ContentServer {

    private static readonly ONE_MINUTE = 60 * 1000 // One minute in milliseconds
    lastKnownTimestamp: Timestamp

    constructor(public name: ServerName) {
        this.lastKnownTimestamp = 0
    }

    async getNewDeployments(): Promise<DeploymentHistory> {
        // Get new deployments
        const newDeployments: DeploymentHistory = await this.getDeploymentHistory()
        if (newDeployments.length == 0) {
            // If there are no new deployments, then update the timestamp with a new call
            const newTimestamp: Timestamp = await this.getCurrentTimestamp() - ContentServer.ONE_MINUTE // Substract 1 min, as to avoid potential race conditions with a new deployment

            // Keep the latest timestamp, since we don't want to go back in time
            this.lastKnownTimestamp = Math.max(newTimestamp, this.lastKnownTimestamp)
        } else {
            // Update the new timestamp with the latest deployment
            this.lastKnownTimestamp = Math.max(...newDeployments.map(deployment => deployment.timestamp))
        }
        return newDeployments
    }

    getEntity(entityType: EntityType, entityId: EntityId): Promise<Entity> {
        // /entity/{entityType}?id={entityId}

        throw new Error("To implement")
    }

    getContentFile(fileHash: FileHash): Promise<File> {
        // /contents/{fileHash}

        throw new Error("To implement")
    }

    private getDeploymentHistory(): Promise<DeploymentHistory> {
        // /history?from={this.lastKnownTimestamp}&serverName={this.name}
        return Promise.resolve([])
    }

    private getCurrentTimestamp(): Promise<Timestamp> {
        // /status
        return Promise.resolve(0)
    }

}

class DAOClient {

    getAllServers(): Promise<ContentServer[]> {
        // We need to:
        // 1. Ask the DAO for the servers
        // 2. Ask each server for their name
        // DON'T UPDATE THE LATEST TIMESTAMP, we will do it after
        return Promise.resolve([])
    }

}