import log4js from "log4js"
import { setTimeout, clearTimeout } from "timers"
import { DAOClient } from "decentraland-katalyst-commons/src/DAOClient";
import { ServerAddress, ContentServerClient, UNREACHABLE, ConnectionState } from "./clients/contentserver/ContentServerClient";
import { NameKeeper, ServerName } from "../naming/NameKeeper";
import { Timestamp } from "../time/TimeSorting";
import { getRedirectClient } from "./clients/contentserver/RedirectContentServerClient";
import { getClient } from "./clients/contentserver/ActiveContentServerClient";
import { getUnreachableClient } from "./clients/contentserver/UnreachableContentServerClient";
import { DAORemovalEvent, DAORemoval } from "./events/DAORemovalEvent";
import { Listener, Disposable } from "./events/ClusterEvent";
import { ServerMetadata } from "decentraland-katalyst-commons/src/ServerMetadata";
import { FetchHelper } from "@katalyst/content/helpers/FetchHelper";

export class ContentCluster {

    private static readonly LOGGER = log4js.getLogger('ContentCluster');

    // My own identity
    private myIdentity: ServerMetadata | undefined
    // Timeout set to sync with DAO
    private syncTimeout: NodeJS.Timeout;
    // Servers that were reached at least once
    private serversInDAO: Map<ServerAddress, ContentServerClient> = new Map()
    // Last immutable time. This shouldn't be a responsibility of the cluster, but we can avoid doing really long calls
    // when creating a new client if we know this.
    private lastImmutableTime: Timestamp = 0
    // An event triggered when a server is removed fro the DAO
    private removalEvent: DAORemovalEvent = new DAORemovalEvent()
    // Time of last sync with the DAO
    private timeOfLastSync: Timestamp = 0

    constructor(private readonly dao: DAOClient,
        private readonly timeBetweenSyncs: number,
        private readonly nameKeeper: NameKeeper,
        private readonly fetchHelper: FetchHelper) { }

    /** Connect to the DAO for the first time */
    async connect(lastImmutableTime: Timestamp): Promise<void> {
        // Set the immutable time
        this.setImmutableTime(lastImmutableTime)

        // Perform first sync with the DAO
        await this.syncWithDAO()
    }

    /** Stop syncing with DAO */
    disconnect() {
        clearTimeout(this.syncTimeout)
        this.dao.disconnect()
    }

    getStatus() {
        const otherServers = Array.from(this.serversInDAO.entries())
            .map(([address, client]) => ( {
                address,
                connectionState: client.getConnectionState(),
                estimatedLocalImmutableTime: client.getEstimatedLocalImmutableTime(),
            } ))

        return { otherServers, lastSyncWithDAO: this.timeOfLastSync }
    }

    getAllServersInCluster(): ContentServerClient[] {
        return Array.from(this.serversInDAO.values())
    }

    getAllActiveServersInCluster(): ContentServerClient[] {
        return Array.from(this.serversInDAO.values())
            .filter(client => client.getConnectionState() === ConnectionState.CONNECTED)
    }

    setImmutableTime(immutableTime: Timestamp) {
        this.lastImmutableTime = immutableTime
    }

    listenToRemoval(listener: Listener<DAORemoval>): Disposable {
        return this.removalEvent.on(listener)
    }

    getOwnIdentity(): ServerMetadata | undefined {
        return this.myIdentity
    }

    /** Update our data with the DAO's servers list */
    private async syncWithDAO() {
        try {
            ContentCluster.LOGGER.debug(`Starting sync with DAO`)

            // Ask the DAO for all the servers
            const allServers: Set<ServerMetadata> = await this.dao.getAllContentServers()

            if (!this.myIdentity) {
                await this.detectMyIdentity(allServers)
            }

            // Get all addresses in cluster (except for me)
            const allAddresses: ServerAddress[] = this.getAllOtherAddressesOnDAO(allServers)

            // Handle the possibility that some servers where removed from the DAO.
            // If so, remove them from the list, and raise an event
            await this.handleRemovalsFromDAO(allAddresses);

            // Get the server name for each address
            const names = await Promise.all(allAddresses
                .map(async address => ({ address, name: await this.getServerName(address) })))

            for (const { address, name: newName } of names) {
                let newClient: ContentServerClient | undefined
                // Check if we already knew the server
                const previousClient: ContentServerClient | undefined = this.serversInDAO.get(address);
                if (previousClient && previousClient.getName() !== UNREACHABLE) {
                    if (newName === UNREACHABLE) {
                        // Create redirect client
                        newClient = getRedirectClient(this, previousClient.getName(), previousClient.getEstimatedLocalImmutableTime())
                        ContentCluster.LOGGER.info(`Can't connect to server ${previousClient.getName()} on ${address}`)
                    } else if (previousClient.getConnectionState() !== ConnectionState.CONNECTED) {
                        // Create new client
                        ContentCluster.LOGGER.info(`Could re-connect to server ${newName} on ${address}`)
                        newClient = getClient(this.fetchHelper, address, newName, previousClient.getEstimatedLocalImmutableTime())
                    }
                } else {
                    if (newName === UNREACHABLE) {
                        // Create unreachable client
                        newClient = getUnreachableClient()
                    } else {
                        // Create new client
                        newClient = getClient(this.fetchHelper, address, newName, this.lastImmutableTime)
                        ContentCluster.LOGGER.info(`Connected to new server ${newName} on ${address}`)
                    }
                }
                if (newClient) {
                    this.serversInDAO.set(address, newClient)
                }
            }

            // Update sync time
            this.timeOfLastSync = Date.now()
            ContentCluster.LOGGER.debug(`Finished sync with DAO`)
        } catch (error) {
            ContentCluster.LOGGER.error(`Failed to sync with the DAO \n${error}`)
        } finally {
            // Set a timeout to stay in sync with the DAO
            this.syncTimeout = setTimeout(() => this.syncWithDAO(), this.timeBetweenSyncs)
        }
    }

    private async handleRemovalsFromDAO(allAddresses: string[]) {
        // Calculate if any known servers where removed from the DAO
        const serversRemovedFromDAO = Array.from(this.serversInDAO.entries())
            .filter(([address,]) => !allAddresses.includes(address));

        // Remove servers from list
        serversRemovedFromDAO.forEach(([address,]) => this.serversInDAO.delete(address));

        // Alert listeners that some servers where removed
        const remainingServersOnDAO: ContentServerClient[] = this.getAllActiveServersInCluster()
        const listenerReactions = serversRemovedFromDAO
            .map(([, client]) => client)
            .filter(client => client.getConnectionState() !== ConnectionState.NEVER_REACHED) // There is no point in letting listeners know that a server we could never reach is no longer on the DAO
            .map(client => {
                const daoRemoval = {
                    serverRemoved: client.getName(),
                    estimatedLocalImmutableTime: client.getEstimatedLocalImmutableTime(),
                    remainingServers: remainingServersOnDAO,
                }
                return this.removalEvent.emit(daoRemoval);
            })
        await Promise.all(listenerReactions)
    }

    /** Detect my own identity */
    private async detectMyIdentity(servers: Set<ServerMetadata>): Promise<void> {
        try {
            // Ask each server for their name
            const serverNames = await Promise.all(Array.from(servers)
                .map(async serverMetadata => ({ metadata: serverMetadata, name: await this.getServerName(serverMetadata.address) })))

            // Filter out other servers
            const serversWithMyName = serverNames.filter(({ name }) => name == this.nameKeeper.getServerName())

            if (serversWithMyName.length > 1) {
                ContentCluster.LOGGER.warn(`Expected to find only one server with my name '${this.nameKeeper.getServerName()}', but found ${serversWithMyName.length}`)
            } else {
                this.myIdentity = serversWithMyName[0]?.metadata
            }
        } catch (error) {
            ContentCluster.LOGGER.error(`Failed to connect with the DAO \n${error}`)
        }
    }

    /** Returns all the addresses on the DAO, except for the current server's */
    private getAllOtherAddressesOnDAO(allServers: Set<ServerMetadata>): ServerAddress[] {
        // Filter myself out
        return Array.from(allServers)
            .map(({ address }) => address)
            .filter(address => address !== this.myIdentity?.address)
    }

    /** Return the server's name, or the text "UNREACHABLE" it it couldn't be reached */
    private async getServerName(address: ServerAddress): Promise<ServerName> {
        try {
            const { name } = await this.fetchHelper.fetchJson(`${address}/status`)
            return name
        } catch (error) {
            return UNREACHABLE
        }
    }

}

