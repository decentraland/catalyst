import { setInterval, clearInterval } from "timers"
import { Service, Timestamp, File, ENTITY_FILE_NAME } from "../Service";
import { EntityId, Entity } from "../Entity";
import { DeploymentHistory, DeploymentEvent, HistoryManager } from "../history/HistoryManager";
import { FileHash } from "../Hashing";
import { ServerName, NameKeeper } from "../naming/NameKeeper";
import { ServerAddress, getServerName, getClient, getUnreachableClient, ContentServerClient, UNREACHABLE } from "./clients/ContentServerClient";
import { DAOClient } from "./clients/DAOClient";
import { Environment, SERVER_PORT } from "../../Environment";

export interface SynchronizationManager {
    start(): Promise<void>;
    stop(): Promise<void>;
}

export class ClusterSynchronizationManager implements SynchronizationManager {

    // private static UPDATE_FROM_DAO_INTERVAL: number = 5 * 60 * 1000 // 5 min
    private static UPDATE_FROM_DAO_INTERVAL: number = 30 * 1000 // 30 secs
    private static SYNC_WITH_SERVERS_INTERVAL: number = 20 * 1000 // 20 secs

    private intervals: NodeJS.Timeout[];
    private lastImmutableTime = 0
    private contentServers: Map<ServerName, ContentServerClient> = new Map()

    constructor(private dao: DAOClient, private nameKeeper: NameKeeper, private historyManager: HistoryManager, private service: Service) { }

    async start(): Promise<void> {
         // TODO: Remove this on final version
         await this.registerServer()

         // Get servers from the DAO
         await this.updateServersList()

         // Sync with the servers
         await this.syncWithServers()

         // Set intervals to update server list and stay in sync with other servers
         const interval1 = setInterval(() => this.updateServersList(), ClusterSynchronizationManager.UPDATE_FROM_DAO_INTERVAL)
         const interval2 = setInterval(() => this.syncWithServers(), ClusterSynchronizationManager.SYNC_WITH_SERVERS_INTERVAL)
         this.intervals = [interval1, interval2]
    }

    stop(): Promise<void> {
        this.intervals.forEach(clearInterval)
        return Promise.resolve()
    }

    private async syncWithServers(): Promise<void> {
        // Gather all servers
        const contentServers: ContentServerClient[] = Array.from(this.contentServers.values())

        // Get new entities and process new deployments
        const updateActions: Promise<void>[] = contentServers.map(server => this.getNewEntitiesDeployedInContentServer(server))
        await Promise.all(updateActions)

        // Find the minimum timestamp between all servers
        const minTimestamp: Timestamp = contentServers.map(contentServer => contentServer.getLastKnownTimestamp())
            .reduce((min, current) => min == -1 ? current : Math.min(min, current), -1)

        if (minTimestamp > this.lastImmutableTime) {
            // Set this new minimum timestamp as the latest immutable time
            console.log(`Setting immutable time to ${minTimestamp}`)
            this.lastImmutableTime = minTimestamp
            await this.historyManager.setTimeAsImmutable(minTimestamp)
        }
    }

    /** Get all updates from one specific content server */
    private async getNewEntitiesDeployedInContentServer(contentServer: ContentServerClient): Promise<void> {
        try {
            // Get new deployments on a specific content server, but make sure they happened after the last immutable time
            const newDeployments: DeploymentHistory = (await contentServer.getNewDeployments())
                .filter(deployment => deployment.timestamp >= this.lastImmutableTime)

            // Get whether these entities have already been deployed or not
            const alreadyDeployedIds: Map<EntityId, Boolean> = await this.service.isContentAvailable(newDeployments.map(deployment => deployment.entityId))

            // Calculate the deployments we are not already aware of
            const unawareDeployments: DeploymentHistory = newDeployments.filter(deployment => !alreadyDeployedIds.get(deployment.entityId))
            console.log(`Detected ${unawareDeployments.length} from server ${contentServer.getName()}.`)

            // Process the deployments
            await Promise.all(unawareDeployments.map(unawareDeployment => this.processNewDeployment(unawareDeployment)))
        } catch(error) {
            console.error(`Failed to get new entities from content server '${contentServer.getName()}'\n${error}`)
        }
    }

    /** Process a specific deployment */
    private async processNewDeployment(deployment: DeploymentEvent): Promise<void> {
        // Find a server with the given name
        const contentServer: ContentServerClient | undefined = this.contentServers.get(deployment.serverName)
        if (contentServer) {
            // Download all entity's files
            const [, files]: [Entity, File[]] = await this.getFilesFromDeployment(contentServer, deployment)

            // Deploy the new entity
            await this.service.deployEntityFromAnotherContentServer(files, deployment.entityId, "ETH ADDRESS", "SIGNATURE", contentServer.getName(), deployment.timestamp)
        } else {
            throw new Error(`Failed to find a whitelisted server with the name ${deployment.serverName}`)
        }
    }

    /** Get all the files needed to deploy the new entity */
    private async getFilesFromDeployment(contentServer: ContentServerClient, event: DeploymentEvent): Promise<[Entity, File[]]> {
        // Retrieve the entity from the server
        const entity: Entity = await contentServer.getEntity(event.entityType, event.entityId)

        // Read the entity, and get all content file hashes
        const allFileHashes: FileHash[] = Array.from(entity.content?.values() ?? [])

        // Check if we already have any of the files
        const avaliableContent: Map<FileHash, Boolean> = await this.service.isContentAvailable(allFileHashes)

        // Download all content files that we don't currently have
        const filePromises: Promise<File>[] = Array.from(avaliableContent.entries())
            .filter(([_, isAlreadyAvailable]) => !isAlreadyAvailable)
            .map(([fileHash, _]) => contentServer.getContentFile(fileHash))

        // Download the entity file and rename it
        let entityFile: File = await contentServer.getContentFile(entity.id)
        entityFile.name = ENTITY_FILE_NAME

        // Combine all files
        const contentFiles = await Promise.all(filePromises)
        contentFiles.push(entityFile)

        // Return all the downloaded files
        return [entity, contentFiles]
    }

    /** Register this server in the DAO id required */
    private async registerServer() {
        const env: Environment = await Environment.getInstance()
        const serverIP = require('ip').address()
        const port: number = env.getConfig(SERVER_PORT)

        await this.dao.registerServerInDAO(`${serverIP}:${port}`)
    }

    /** Update our data with the DAO's servers list */
    private async updateServersList() {
        try {
            // Ask the DAO for all the addresses, and ask each server for their name
            const allServerActions = (await this.dao.getAllServers())
                .map(address => getServerName(address).then(name => ({ address, name })))

            // Filter myself out of the list
            const allServersInDAO = (await Promise.all(allServerActions))
                .filter(({ name }) => name != this.nameKeeper.getServerName())

            // Build server clients for new servers
            const newServersActions: Promise<ContentServerClient>[] = allServersInDAO
                .filter(({ name }) => !this.contentServers.has(name))
                .map(({ address, name }) => this.buildNewServerClient(address, name))

            // Store the clients
            for (const newServer of (await Promise.all(newServersActions))) {
                this.contentServers.set(newServer.getName(), newServer)
                console.log(`Connected to new server ${newServer.getName()}`)
            }

            // Delete servers that were removed from the DAO
            const serverNamesInDAO: Set<ServerName> = new Set(allServersInDAO.map(({ name }) => name))
            Array.from(this.contentServers.keys())
                .filter(serverName => !serverNamesInDAO.has(serverName))
                .forEach(serverName => this.contentServers.delete(serverName))
        } catch (error) {
            console.error(`Failed to sync with the DAO \n${error}`)
        }
    }

    private async buildNewServerClient(serverAddress: ServerAddress, serverName: ServerName): Promise<ContentServerClient> {
        if (serverName != UNREACHABLE) {
            // Check if we already knew something about the server
            const knownServerHistory: DeploymentHistory = await this.historyManager.getHistory(undefined, undefined, serverName)
            let lastKnownTimestamp: Timestamp = this.lastImmutableTime

            if (knownServerHistory.length > 0 && knownServerHistory[0].timestamp > this.lastImmutableTime) {
                // If we already know a deployment after the last immutable time, then set the last known timestamp
                lastKnownTimestamp = knownServerHistory[0].timestamp
            }

            return getClient(serverName, serverAddress, lastKnownTimestamp)
        } else {
            // If name is "UNREACHABLE", then it means we get the actual name
            return getUnreachableClient()
        }
    }

}
