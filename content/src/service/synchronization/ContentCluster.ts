import ms from "ms";
import log4js from "log4js"
import { setTimeout, clearTimeout } from "timers"
import { ServerAddress, Timestamp, ServerName, Fetcher } from "dcl-catalyst-commons";
import { DAOClient } from "decentraland-katalyst-commons/DAOClient";
import { delay } from "decentraland-katalyst-utils/util";
import { ContentServerClient, UNREACHABLE, ConnectionState } from "./clients/contentserver/ContentServerClient";
import { NameKeeper } from "../naming/NameKeeper";
import { getRedirectClient } from "./clients/contentserver/RedirectContentServerClient";
import { getClient } from "./clients/contentserver/ActiveContentServerClient";
import { getUnreachableClient } from "./clients/contentserver/UnreachableContentServerClient";
import { DAORemovalEvent, DAORemoval } from "./events/DAORemovalEvent";
import { Listener, Disposable } from "./events/ClusterEvent";
import { ServerMetadata } from "decentraland-katalyst-commons/ServerMetadata";
import { ChallengeSupervisor, ChallengeText } from "./ChallengeSupervisor"

export interface IdentityProvider {
    getIdentityInDAO(): ServerIdentity | undefined;
}

export class ContentCluster implements IdentityProvider {

    private static readonly LOGGER = log4js.getLogger('ContentCluster');

    // My own identity
    private myIdentity: ServerIdentity | undefined
    // Timeout set to sync with DAO
    private syncTimeout: NodeJS.Timeout;
    // Servers that were reached at least once
    private serverClients: Map<ServerAddress, ContentServerClient> = new Map()
    // All the servers on the DAO. Renewed with each sync
    private allServersInDAO: Set<ServerMetadata>
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
        private readonly challengeSupervisor: ChallengeSupervisor,
        private readonly fetcher: Fetcher,
        private readonly requestTtlBackwards: number) { }

    /** Connect to the DAO for the first time */
    async connect(lastImmutableTime: Timestamp): Promise<void> {
        // Set the immutable time
        this.setImmutableTime(lastImmutableTime)

        // Get all servers on the DAO
        this.allServersInDAO = await this.dao.getAllContentServers()

        // Detect my own identity
        await this.detectMyIdentity(10)

        // TODO: Remove when syncing with /deployments instead of /history
        await delay(1000)

        // Perform first sync with the DAO
        await this.syncWithDAO()
    }

    /** Stop syncing with DAO */
    disconnect() {
        clearTimeout(this.syncTimeout)
    }

    getStatus() {
        const otherServers = Array.from(this.serverClients.entries())
            .map(([address, client]) => ( {
                address,
                connectionState: client.getConnectionState(),
                estimatedLocalImmutableTime: client.getEstimatedLocalImmutableTime(),
            } ))

        return { otherServers, lastSyncWithDAO: this.timeOfLastSync }
    }

    getAddressForServerName(serverName: ServerName): ServerAddress | undefined {
        if (this.myIdentity && this.myIdentity.name === serverName) {
            return this.myIdentity.address
        } else {
            return Array.from(this.serverClients.entries())
                .filter(([, client]) => client.getName() === serverName)
                .map(([address]) => address)[0]
        }
    }

    getServerNameForAddress(address: ServerAddress): ServerName | undefined {
        if (this.myIdentity && this.myIdentity.address === address) {
            return this.myIdentity.name
        } else {
            return this.serverClients.get(address)?.getName()
        }
    }

    getAllServersInCluster(): ContentServerClient[] {
        return Array.from(this.serverClients.values())
    }

    getAllActiveServersInCluster(): ContentServerClient[] {
        return Array.from(this.serverClients.values())
            .filter(client => client.getConnectionState() === ConnectionState.CONNECTED)
    }

    setImmutableTime(immutableTime: Timestamp) {
        this.lastImmutableTime = immutableTime
    }

    listenToRemoval(listener: Listener<DAORemoval>): Disposable {
        return this.removalEvent.on(listener)
    }

    getIdentityInDAO(): ServerIdentity | undefined {
        return this.myIdentity
    }

    /** Update our data with the DAO's servers list */
    private async syncWithDAO() {
        try {
            ContentCluster.LOGGER.debug(`Starting sync with DAO`)

            // Refresh the server list
            this.allServersInDAO = await this.dao.getAllContentServers()

            if (!this.myIdentity) {
                await this.detectMyIdentity()
            }

            // Get all addresses in cluster (except for me)
            const allAddresses: ServerAddress[] = this.getAllOtherAddressesOnDAO(this.allServersInDAO)

            // Handle the possibility that some servers where removed from the DAO.
            // If so, remove them from the list, and raise an event
            await this.handleRemovalsFromDAO(allAddresses);

            // Get the server name for each address
            const names = await Promise.all(allAddresses
                .map(async address => ({ address, name: await this.getServerName(address) })))

            for (const { address, name: newName } of names) {
                let newClient: ContentServerClient | undefined
                // Check if we already knew the server
                const previousClient: ContentServerClient | undefined = this.serverClients.get(address);
                if (previousClient && previousClient.getConnectionState() !== ConnectionState.NEVER_REACHED) {
                    if (newName === UNREACHABLE) {
                        // Create redirect client
                        newClient = getRedirectClient(this, previousClient.getName(), previousClient.getEstimatedLocalImmutableTime())
                        ContentCluster.LOGGER.info(`Can't connect to server ${previousClient.getName()} on ${address}`)
                    } else if (previousClient.getConnectionState() !== ConnectionState.CONNECTED) {
                        // Create new client
                        ContentCluster.LOGGER.info(`Could re-connect to server ${newName} on ${address}`)
                        newClient = getClient(this.fetcher, address, this.requestTtlBackwards, newName, previousClient.getEstimatedLocalImmutableTime())
                    } else if (previousClient.getName() !== newName) {
                        // Update known name to new one
                        ContentCluster.LOGGER.warn(`Server's name changed on ${address}. It was ${previousClient.getName()} and now it is ${newName}.`)
                        newClient = getClient(this.fetcher, address, this.requestTtlBackwards, newName, previousClient.getEstimatedLocalImmutableTime())
                    }
                } else {
                    if (newName === UNREACHABLE) {
                        // Create unreachable client
                        newClient = getUnreachableClient()
                    } else {
                        // Create new client
                        newClient = getClient(this.fetcher, address, this.requestTtlBackwards, newName, this.lastImmutableTime)
                        ContentCluster.LOGGER.info(`Connected to new server ${newName} on ${address}`)
                    }
                }
                if (newClient) {
                    this.serverClients.set(address, newClient)
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
        const serversRemovedFromDAO = Array.from(this.serverClients.entries())
            .filter(([address,]) => !allAddresses.includes(address));

        // Remove servers from list
        serversRemovedFromDAO.forEach(([address,]) => this.serverClients.delete(address));

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
    async detectMyIdentity(attempts: number = 1): Promise<void> {
        try {
            // Fetch server list from the DAO
            if (!this.allServersInDAO) {
                this.allServersInDAO = await this.dao.getAllContentServers()
            }

            const serversByAddresses: Map<ServerAddress, ServerMetadata> = new Map(Array.from(this.allServersInDAO).map(metadata => [metadata.address, metadata]))
            const challengesByAddress: Map<ServerAddress, ChallengeText> = new Map()

            while (attempts > 0 && challengesByAddress.size < this.allServersInDAO.size) {
                // Prepare challenges for unknown servers
                const challenges: Promise<{address: ServerAddress, challengeText: ChallengeText | undefined}>[] = Array.from(serversByAddresses.keys())
                    .filter(address => !challengesByAddress.has(address))
                    .map(async address => ({ address, challengeText: await this.getChallengeInServer(address) }))

                // Store new challenge results
                const challengeResults = await Promise.all(challenges)
                challengeResults
                    .filter(({ challengeText }) => !!challengeText)
                    .forEach(({ address, challengeText }) => challengesByAddress.set(address, challengeText!!))

                // Check if I was any of the servers who responded
                const serversWithMyChallengeText = Array.from(challengesByAddress.entries())
                    .filter(([, challengeText]) => this.challengeSupervisor.isChallengeOk(challengeText))

                if (serversWithMyChallengeText.length === 1){
                    const [ address ] = serversWithMyChallengeText[0]
                    // TODO: In the future, calculate the name based on the address
                    const name = this.nameKeeper.getServerName()
                    this.myIdentity = {
                        ...serversByAddresses.get(address)!!,
                        name
                    }
                    ContentCluster.LOGGER.info(`Calculated my identity. My address is ${address} and my name is '${name}'`)
                    break;
                } else if (serversWithMyChallengeText.length > 1) {
                    ContentCluster.LOGGER.warn(`Expected to find only one server with my challenge text '${this.challengeSupervisor.getChallengeText()}', but found ${serversWithMyChallengeText.length}`)
                    break;
                }
                attempts--;
                if (attempts > 0) {
                    await delay(ms('30s'))
                }
            }
        } catch (error) {
            ContentCluster.LOGGER.error(`Failed to detect my own identity \n${error}`)
        }
    }

    /** Returns all the addresses on the DAO, except for the current server's */
    private getAllOtherAddressesOnDAO(allServers: Set<ServerMetadata>): ServerAddress[] {
        // Filter myself out
        return Array.from(allServers)
            .map(({ address }) => address)
            .filter(address => address !== this.myIdentity?.address)
    }

    /** Return the server's name, or the text "UNREACHABLE" if it couldn't be reached */
    private async getServerName(address: ServerAddress): Promise<ServerName> {
        try {
            const { name } = await this.fetcher.fetchJson(`${address}/status`)
            return name
        } catch (error) {
            return UNREACHABLE
        }
    }

    /** Return the server's challenge text, or undefined if it couldn't be reached */
    private async getChallengeInServer(address: ServerAddress): Promise<ChallengeText | undefined> {
        try {
            const { challengeText }: { challengeText: ChallengeText } = await this.fetcher.fetchJson(`${address}/challenge`)
            return challengeText
        } catch (error) { }
    }
}

type ServerIdentity = ServerMetadata & { name: ServerName }

