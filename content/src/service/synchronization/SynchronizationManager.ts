import { setInterval, clearInterval } from "timers"
import { Timestamp, File, ENTITY_FILE_NAME, ClusterAwareService } from "../Service";
import { EntityId, Entity } from "../Entity";
import { DeploymentHistory, DeploymentEvent } from "../history/HistoryManager";
import { FileHash } from "../Hashing";
import { ServerName, NameKeeper } from "../naming/NameKeeper";
import { ServerAddress, getServerName, getClient, getUnreachableClient, ContentServerClient, UNREACHABLE } from "./clients/ContentServerClient";
import { DAOClient } from "./clients/DAOClient";
import { Environment, EnvironmentConfig } from "../../Environment";

export interface SynchronizationManager {
    start(): Promise<void>;
    stop(): Promise<void>;
}

export class ClusterSynchronizationManager implements SynchronizationManager {

    private intervals: NodeJS.Timeout[];
    private lastImmutableTime = 0
    private contentServers: Map<ServerName, ContentServerClient> = new Map()

    constructor(private dao: DAOClient,
        private nameKeeper: NameKeeper,
        private service: ClusterAwareService,
        private updateFromDAOInterval: number,
        private syncWithServersInterval: number) { }

    async start(): Promise<void> {
         // TODO: Remove this on final version
         await this.registerServer()

         // Get servers from the DAO
         await this.updateServersList()

         // Sync with the servers
         await this.syncWithServers()

         // Set intervals to update server list and stay in sync with other servers
         const interval1 = setInterval(() => this.updateServersList(), this.updateFromDAOInterval)
         const interval2 = setInterval(() => this.syncWithServers(), this.syncWithServersInterval)
         this.intervals = [interval1, interval2]
    }

    stop(): Promise<void> {
        this.intervals?.forEach(clearInterval)
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
            await this.service.setImmutableTime(this.lastImmutableTime)
        }
    }

    /** Get all updates from one specific content server */
    private async getNewEntitiesDeployedInContentServer(contentServer: ContentServerClient): Promise<void> {
        try {
            // Get new deployments on a specific content server
            const newDeployments: DeploymentHistory = (await contentServer.getNewDeployments())

            // Process them
            await this.processNewDeploymentsIfNotAlreadyKnown(newDeployments, contentServer)
        } catch(error) {
            console.error(`Failed to get new entities from content server '${contentServer.getName()}'\n${error}`)
        }
    }

    private async processNewDeploymentsIfNotAlreadyKnown(updates: DeploymentHistory, source: ContentServerClient): Promise<void> {
        // Make sure the updates happened after the last immutable time
        const newDeployments: DeploymentHistory = updates
            .filter(deployment => deployment.timestamp >= this.lastImmutableTime)

        // Get whether these entities have already been deployed or not
        const alreadyDeployedIds: Map<EntityId, Boolean> = await this.service.isContentAvailable(newDeployments.map(deployment => deployment.entityId))

        // Calculate the deployments we are not already aware of
        const unawareDeployments: DeploymentHistory = newDeployments.filter(deployment => !alreadyDeployedIds.get(deployment.entityId))
        console.log(`Detected ${unawareDeployments.length} from server ${source.getName()}.`)

        // Process the deployments
        await Promise.all(unawareDeployments.map(unawareDeployment => this.processNewDeployment(unawareDeployment, source)))
    }

    /** Process a specific deployment, by asking a specific server for all the necessary information */
    private async processNewDeployment(deployment: DeploymentEvent, source: ContentServerClient): Promise<void> {
        // Download all entity's files
        const [, files]: [Entity, File[]] = await this.getFilesFromDeployment(source, deployment)

        // Get the audit info
        const auditInfo = await source.getAuditInfo(deployment.entityType, deployment.entityId);

        // Deploy the new entity
        await this.service.deployEntityFromCluster(files, deployment.entityId, auditInfo.ethAddress, auditInfo.signature, deployment.serverName, deployment.timestamp)
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

    /**
     * When a node is removed from the DAO, we want to ask all other servers on the DAO if they new something else about it
     */
    private async handleServerRemoval(removedServer: ServerName) {
        const lastKnownTimestamp: Timestamp | undefined = this.contentServers.get(removedServer)?.getLastKnownTimestamp()
        if (lastKnownTimestamp) {
            console.log(`Handing removal of ${removedServer}. It's last known timestamp if ${lastKnownTimestamp}`)
            // Get the removed server's history from each other server on the DAO
            const historiesRetrieval: Promise<[ContentServerClient, DeploymentHistory]>[] = Array.from(this.contentServers.values())
                .filter(server => server.getName() != removedServer)
                .map(server => server.getOtherServersDeployments(removedServer, lastKnownTimestamp as Timestamp).then(history => [server, history]));
            const allHistories: Map<ContentServerClient, DeploymentHistory> = new Map(await Promise.all(historiesRetrieval))

            // Process the deployments
            allHistories.forEach((deploymentHistory, server) => this.processNewDeploymentsIfNotAlreadyKnown(deploymentHistory, server))
        }
    }

    /** Register this server in the DAO id required */
    private async registerServer() {
        const env: Environment = await Environment.getInstance()
        const serverIP = require('ip').address()
        const port: number = env.getConfig(EnvironmentConfig.SERVER_PORT)

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

            // Calculate if any servers where removed from the DAO
            const serverNamesInDAO: Set<ServerName> = new Set(allServersInDAO.map(({ name }) => name))
            const serversRemovedFromDAO: ServerName[] = Array.from(this.contentServers.keys())
                .filter(serverName => !serverNamesInDAO.has(serverName))

            // Get updates from other nodes
            const lastUpdateSeek = serversRemovedFromDAO.map(removedServer => this.handleServerRemoval(removedServer));
            await Promise.all(lastUpdateSeek)

            // Delete servers that were removed from the DAO
            serversRemovedFromDAO
                .forEach(serverName => this.contentServers.delete(serverName))

            // Build server clients for new servers
            const newServersActions: Promise<ContentServerClient>[] = allServersInDAO
                .filter(({ name }) => !this.contentServers.has(name))
                .map(({ address, name }) => this.buildNewServerClient(address, name))

            // Store the clients
            for (const newServer of (await Promise.all(newServersActions))) {
                this.contentServers.set(newServer.getName(), newServer)
                console.log(`Connected to new server ${newServer.getName()}`)
            }
        } catch (error) {
            console.error(`Failed to sync with the DAO \n${error}`)
        }
    }

    private async buildNewServerClient(serverAddress: ServerAddress, serverName: ServerName): Promise<ContentServerClient> {
        if (serverName != UNREACHABLE) {
            // Check if we already knew something about the server
            let lastKnownTimestamp: Timestamp | undefined = await this.service.getLastKnownTimeForServer(serverName)

            if (lastKnownTimestamp && lastKnownTimestamp > this.lastImmutableTime) {
                return getClient(serverName, serverAddress, lastKnownTimestamp)
            } else {
                return getClient(serverName, serverAddress, this.lastImmutableTime)
            }
        } else {
            return getUnreachableClient()
        }
    }

}
