import { setTimeout, clearTimeout } from "timers"
import ms from "ms";
import log4js from "log4js"
import { TimeKeepingService } from "../Service";
import { Timestamp } from "../time/TimeSorting";
import { DeploymentHistory } from "../history/HistoryManager";
import { ContentServerClient } from "./clients/contentserver/ContentServerClient";
import { ContentCluster } from "./ContentCluster";
import { EventDeployer } from "./EventDeployer";
import { MultiServerHistoryRequest } from "./MultiServerHistoryRequest";
import { Bootstrapper } from "./Bootstrapper";
import { Disposable } from "./events/ClusterEvent";
import { delay } from "decentraland-katalyst-utils/util";

export interface SynchronizationManager {
    start(): Promise<void>;
    stop(): Promise<void>;
    getStatus();
}

export class ClusterSynchronizationManager implements SynchronizationManager {

    private static readonly LOGGER = log4js.getLogger('ClusterSynchronizationManager');
    private syncWithNodesTimeout: NodeJS.Timeout;
    private daoRemovalEventSubscription: Disposable
    private lastImmutableTime = 0
    private synchronizationState: SynchronizationState = SynchronizationState.BOOTSTRAPPING
    private stopping: boolean = false

    constructor(private readonly cluster: ContentCluster,
        private readonly service: TimeKeepingService,
        private readonly deployer: EventDeployer,
        private readonly timeBetweenSyncs: number,
        private readonly performMultiServerOnboarding: boolean,
        private readonly requestTtlBackwards: number) { }

    async start(): Promise<void> {
        // Make sure the stopping flag is set to false
        this.stopping = false

        // Read immutable time from the history I have
        this.lastImmutableTime = this.service.getLastImmutableTime()

        // Connect to the cluster
        await this.cluster.connect(this.lastImmutableTime)

        // Register to listen to when a server is removed from the DAO
        this.daoRemovalEventSubscription = this.cluster.listenToRemoval(removal => this.handleServerRemoval(removal));

        // Onboard into cluster
        await Bootstrapper.onboardIntoCluster(this.cluster, this.deployer, this.lastImmutableTime, this.performMultiServerOnboarding)

        // Set a timeout to stay in sync with other servers
        this.syncWithNodesTimeout = setTimeout(() => this.syncWithServers(), this.timeBetweenSyncs)
    }

    stop(): Promise<void> {
        this.stopping = true
        clearTimeout(this.syncWithNodesTimeout)
        this.daoRemovalEventSubscription?.dispose()
        this.cluster.disconnect()
        return this.waitUntilSyncFinishes()
    }

    getStatus() {
        const clusterStatus = this.cluster.getStatus()
        return {
            ...clusterStatus,
            synchronizationState: this.synchronizationState,
        }
    }

    private async syncWithServers(): Promise<void> {
        // Update flag
        this.synchronizationState = SynchronizationState.SYNCING

        ClusterSynchronizationManager.LOGGER.debug(`Starting to sync with servers`)
        try {
            // Gather all servers
            const contentServers: ContentServerClient[] = this.cluster.getAllServersInCluster()

            // Fetch and process new deployments
            await Promise.all(contentServers.map(server => this.syncWithContentServer(server)))

            // Find the minimum timestamp between all servers
            const minTimestamp: Timestamp = contentServers.map(contentServer => contentServer.getEstimatedLocalImmutableTime())
                .reduce((min, current) => Math.min(min, current), Date.now() - this.requestTtlBackwards)

            if (minTimestamp > this.lastImmutableTime) {
                // Set this new minimum timestamp as the latest immutable time
                ClusterSynchronizationManager.LOGGER.debug(`Setting immutable time to ${minTimestamp}`)
                this.lastImmutableTime = minTimestamp
                this.cluster.setImmutableTime(minTimestamp)
                await this.service.setImmutableTime(minTimestamp)
            }

            this.synchronizationState = SynchronizationState.SYNCED;
            ClusterSynchronizationManager.LOGGER.debug(`Finished syncing with servers`)
        } catch(error) {
            this.synchronizationState = SynchronizationState.FAILED_TO_SYNC;
            ClusterSynchronizationManager.LOGGER.warn(`Failed to sync with servers. Reason:\n${error}`)
        } finally {
            if (!this.stopping) {
                // Set the timeout again
                this.syncWithNodesTimeout = setTimeout(() => this.syncWithServers(), this.timeBetweenSyncs)
            }
        }
    }

    /** Get all updates from one specific content server */
    private async syncWithContentServer(contentServer: ContentServerClient): Promise<void> {
        try {
            // Get new deployments on a specific content server
            const newDeployments: DeploymentHistory = await contentServer.getNewDeployments()

            // Process them
            await this.deployer.deployHistory(newDeployments, { preferredServer: contentServer })

            // Let the client know that the deployment was successful, and update the estimated immutable time
            await contentServer.updateEstimatedLocalImmutableTime(newDeployments[0]?.timestamp)
        } catch(error) {
            ClusterSynchronizationManager.LOGGER.error(`Failed to get new entities from content server '${contentServer.getName()}'\n${error}`)
        }
    }

    /**
     * When a node is removed from the DAO, we want to ask all other servers on the DAO if they knew something else about it
     */
    private handleServerRemoval({ serverRemoved, estimatedLocalImmutableTime, remainingServers }): Promise<void> {
        ClusterSynchronizationManager.LOGGER.info(`Handling removal of ${serverRemoved}. It's estimated local immutable time is ${estimatedLocalImmutableTime}`)

        // Prepare request
        const request = new MultiServerHistoryRequest(remainingServers, this.deployer, estimatedLocalImmutableTime, serverRemoved)

        // Execute the request
        return request.execute()
    }

    private waitUntilSyncFinishes(): Promise<void> {
        return new Promise(async (resolve) => {
            while (this.synchronizationState === SynchronizationState.SYNCING) {
                await delay(ms('1s'))
            }
            resolve()
        })
    }

}

enum SynchronizationState {
    BOOTSTRAPPING = "Bootstrapping",
    SYNCED = "Synced",
    SYNCING = "Syncing",
    FAILED_TO_SYNC = "Failed to sync"
}
