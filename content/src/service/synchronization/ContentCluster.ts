import { setInterval, clearInterval } from "timers"
import { DAOClient } from "./clients/DAOClient";
import { ServerAddress, getServerName, ContentServerClient, UNREACHABLE } from "./clients/contentserver/ContentServerClient";
import { NameKeeper } from "../naming/NameKeeper";

import { Timestamp } from "../time/TimeSorting";
import { getRedirectClient } from "./clients/contentserver/RedirectContentServerClient";
import { getClient } from "./clients/contentserver/ActiveContentServerClient";
import { getUnreachableClient } from "./clients/contentserver/UnreachableContentServerClient";
import { DAORemovalEvent, DAORemoval } from "./events/DAORemovalEvent";
import { Listener, Disposable } from "./events/ClusterEvent";
import { EthAddress } from "dcl-crypto";

export class ContentCluster {

    // My own identity
    private myIdentity: ServerMetadata | undefined
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
        // Set the immutable time
        this.setImmutableTime(lastImmutableTime)

        // Perform first sync with the DAO
        await this.syncWithDAO()

        // Set up continuous sync interval
        this.syncInterval = setInterval(() => this.syncWithDAO(), this.updateFromDAOInterval)
    }

    /** Stop syncing with DAO */
    disconnect() {
        clearInterval(this.syncInterval)
        this.dao.disconnect()
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

    getOwnIdentity(): ServerMetadata | undefined {
        return this.myIdentity
    }

    /** Update our data with the DAO's servers list */
    private async syncWithDAO() {
        try {
            // Ask the DAO for all the servers
            const allServers: Set<ServerMetadata> = await this.dao.getAllServers()

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
                .map(address => getServerName(address).then(name => ({ address, name }))))

            for (const { address, name: newName } of names) {
                let newClient: ContentServerClient | undefined
                // Check if we already knew the server
                const previousClient: ContentServerClient | undefined = this.serversInDAO.get(address);
                if (previousClient && previousClient.getName() !== UNREACHABLE) {
                    if (newName === UNREACHABLE) {
                        // Create redirect client
                        newClient = getRedirectClient(this, previousClient.getName(), previousClient.getLastKnownTimestamp())
                    } else if (!previousClient.isActive()){
                        // Create new client
                        newClient = getClient(address, newName, previousClient.getLastKnownTimestamp())
                    }
                } else {
                    if (newName === UNREACHABLE) {
                        // Create unreachable client
                        newClient = getUnreachableClient()
                    } else {
                        // Create new client
                        newClient = getClient(address, newName, this.lastImmutableTime)
                        console.log(`Connected to new server ${newName} on ${address}`)
                    }
                }
                if (newClient) {
                    this.serversInDAO.set(address, newClient)
                }
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

    /** Detect my own identity */
    private async detectMyIdentity(servers: Set<ServerMetadata>): Promise<void> {
        try {
            // Ask each server for their name
            const serverNames = await Promise.all(Array.from(servers)
                .map(serverMetadata => getServerName(serverMetadata.address).then(name => ({ metadata: serverMetadata, name }))))

            // Filter out other servers
            const serversWithMyName = serverNames.filter(({ name }) => name == this.nameKeeper.getServerName())

            if (serversWithMyName.length > 1) {
                console.log(`Expected to find only one server with my name '${this.nameKeeper.getServerName()}', but found ${serversWithMyName.length}`)
            } else {
                this.myIdentity = serversWithMyName[0]?.metadata
            }
        } catch (error) {
            console.log(`Failed to connect with the DAO \n${error}`)
        }
    }

    /** Returns all the addresses on the DAO, except for the current server's */
    private getAllOtherAddressesOnDAO(allServers: Set<ServerMetadata>): ServerAddress[] {
        // Filter myself out
        return Array.from(allServers)
            .map(({ address }) => address)
            .filter(address => address !== this.myIdentity?.address)
    }

}

export type ServerMetadata = {
    address: ServerAddress,
    owner: EthAddress,
    id: string
}