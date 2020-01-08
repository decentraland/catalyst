import { setInterval, clearInterval } from "timers"
import { Environment, EnvironmentConfig } from "../../Environment";
import { DAOClient } from "./clients/DAOClient";
import { ServerAddress, getServerName, ContentServerClient, UNREACHABLE } from "./clients/contentserver/ContentServerClient";
import { NameKeeper } from "../naming/NameKeeper";

import { Timestamp } from "../time/TimeSorting";
import { getRedirectClient } from "./clients/contentserver/RedirectContentServerClient";
import { getClient } from "./clients/contentserver/ActiveContentServerClient";
import { getUnreachableClient } from "./clients/contentserver/UnreachableContentServerClient";
import { DAORemovalEvent, DAORemoval } from "./events/DAORemovalEvent";
import { Listener, Disposable } from "./events/ClusterEvent";

export class ContentCluster {

    // My own address
    private myAddress: ServerAddress | undefined
    // Interval set to sync with DAO
    private syncInterval: NodeJS.Timeout;
    // Servers that were reached at least once
    private serversInDAO: Map<ServerAddress, ContentServerClient> = new Map()
    // Last immutable time. This shouldn't be a responsibility of the cluster, but we can avoid doing really long calls
    // when creating a new client if we know this.
    private lastImmutableTime: Timestamp = 0

    private removalEvent: DAORemovalEvent = new DAORemovalEvent()

    constructor(private dao: DAOClient,
        private updateFromDAOInterval: number,
        private nameKeeper: NameKeeper) { }

    /** Connect to the DAO for the first time */
    async connect(lastImmutableTime: Timestamp): Promise<void> {
        // TODO: Remove before releasing
        await this.registerServer()

        // Set the immutable time
        this.setImmutableTime(lastImmutableTime)

        // Detect my own address
        this.myAddress = await this.detectMyAddress()

        // Perform first sync with the DAO
        await this.syncWithDAO()

        // Set up continuous sync interval
        this.syncInterval = setInterval(() => this.syncWithDAO(), this.updateFromDAOInterval)
    }

    /** Stop syncing with DAO */
    disconnect() {
        clearInterval(this.syncInterval)
    }

    getAllServersInCluster(): ContentServerClient[] {
        return Array.from(this.serversInDAO.values())
    }

    getAllActiveServersInCluster(): ContentServerClient[] {
        return Array.from(this.serversInDAO.values())
            .filter(client => client.isActive())
    }

    setImmutableTime(immutableTime: Timestamp) {
        this.lastImmutableTime = immutableTime
    }

    listenToRemoval(listener: Listener<DAORemoval>): Disposable {
        return this.removalEvent.on(listener)
    }

    /** Register this server in the DAO id required */
    private async registerServer() {
        const env: Environment = await Environment.getInstance()
        const serverIP = require('ip').address()
        const port: number = env.getConfig(EnvironmentConfig.SERVER_PORT)

        await this.dao.registerServerInDAO(`${serverIP}:${port}`)
    }

    /** Update our data with the DAO's servers list */
    private async syncWithDAO() {
        try {
            // Get all addresses in cluster (except for me)
            const allAddresses: ServerAddress[] = await this.getAllOtherAddressesOnDAO()

            // Handle the possibility that some servers where removed from the DAO.
            // If so, remove them from the list, and raise an event
            await this.handleRemovalsFromDAO(allAddresses);

            // Get the server name for each address
            const names = await Promise.all(allAddresses
                .map(address => getServerName(address).then(name => ({ address, name }))))

            for (const { address, name: newName } of names) {
                let newClient: ContentServerClient
                // Check if we already knew the server
                if (this.serversInDAO.has(address)) {
                    const previousClient = this.serversInDAO.get(address) as ContentServerClient
                    if (newName == UNREACHABLE) {
                        // Create redirect client
                        newClient = getRedirectClient(this, previousClient.getName(), previousClient.getLastKnownTimestamp())
                    } else {
                        // Create new client
                        newClient = getClient(address, newName, previousClient.getLastKnownTimestamp())
                    }
                } else {
                    if (newName == UNREACHABLE) {
                        // Create unreachable client
                        newClient = getUnreachableClient()
                    } else {
                        // Create new client
                        newClient = getClient(address, newName, this.lastImmutableTime)
                        console.log(`Connected to new server ${newName}`)
                    }
                }
                this.serversInDAO.set(address, newClient)
            }
        } catch (error) {
            console.error(`Failed to sync with the DAO \n${error}`)
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
            .filter(client => client.getName() != UNREACHABLE) // There is no point in letting listeners know that a server we could never reach is no longer on the DAO
            .map(client => {
                const daoRemoval = {
                    serverRemoved: client.getName(),
                    lastKnownTimestamp: client.getLastKnownTimestamp(),
                    remainingServers: remainingServersOnDAO,
                }
                return this.removalEvent.emit(daoRemoval);
            })
        await Promise.all(listenerReactions)
    }

    /** Detect my own address */
    private async detectMyAddress(): Promise<ServerAddress | undefined> {
        try {
            // Ask the DAO for all the addresses
            const allAddresses: Set<ServerAddress> = await this.dao.getAllServers()

            // Ask each server for their name
            const serverNames = await Promise.all(Array.from(allAddresses)
                .map(address => getServerName(address).then(name => ({ address, name }))))

            // Filter out other servers
            const serversWithMyName = serverNames.filter(({ name }) => name == this.nameKeeper.getServerName())

            if (serversWithMyName.length > 1) {
                throw new Error(`Expected to find only one server with my name '${this.nameKeeper.getServerName()}', but found ${serversWithMyName.length}`)
            } else {
                return serversWithMyName[0]?.address
            }
        } catch (error) {
            throw new Error(`Failed to connect with the DAO \n${error}`)
        }
    }

    /** Returns all the addresses on the DAO, except for the current server's */
    private async getAllOtherAddressesOnDAO(): Promise<ServerAddress[]> {
        // Ask the DAO for all the addresses
        const allAddresses: Set<ServerAddress> = await this.dao.getAllServers()

        // Filter myself out
        return Array.from(allAddresses)
            .filter(address => address != this.myAddress)
    }

}