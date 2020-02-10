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
import { sleep } from "./ClusterUtils";

export interface SynchronizationManager {
    start(): Promise<void>;
    stop(): Promise<void>;
}

export class ClusterSynchronizationManager implements SynchronizationManager {

    private static readonly LOGGER = log4js.getLogger('ClusterSynchronizationManager');
    private syncWithNodesTimeout: NodeJS.Timeout;
    private daoRemovalEventSubscription: Disposable
    private lastImmutableTime = 0
    private processing: boolean = false

    constructor(private readonly cluster: ContentCluster,
        private readonly service: TimeKeepingService,
        private readonly deployer: EventDeployer,
        private readonly timeBetweenSyncs: number) { }

    async start(): Promise<void> {
        // Read immutable time from the history I have
        this.lastImmutableTime = this.service.getLastImmutableTime()

        // Connect to the cluster
        await this.cluster.connect(this.lastImmutableTime)

        // Register to listen to when a server is removed from the DAO
        this.daoRemovalEventSubscription = this.cluster.listenToRemoval(removal => this.handleServerRemoval(removal));

        // Onboard into cluster
        await Bootstrapper.onboardIntoCluster(this.cluster, this.deployer, this.lastImmutableTime)

        // Set a timeout to stay in sync with other servers
        this.syncWithNodesTimeout = setTimeout(() => this.syncWithServers(), this.timeBetweenSyncs)
    }

    stop(): Promise<void> {
        clearTimeout(this.syncWithNodesTimeout)
        this.daoRemovalEventSubscription?.dispose()
        this.cluster.disconnect()
        return this.waitUntilSyncFinishes()
    }

    private async syncWithServers(): Promise<void> {
        // Update flag
        this.processing = true;

        ClusterSynchronizationManager.LOGGER.debug(`Starting to sync with servers`)
        try {
            // Gather all servers
            const contentServers: ContentServerClient[] = this.cluster.getAllServersInCluster()

            // Fetch and process new deployments
            await Promise.all(contentServers.map(server => this.syncWithContentServer(server)))

            // Find the minimum timestamp between all servers
            const minTimestamp: Timestamp = contentServers.map(contentServer => contentServer.getLastKnownTimestamp())
                .reduce((min, current) => Math.min(min, current), Date.now())

            if (minTimestamp > this.lastImmutableTime) {
                // Set this new minimum timestamp as the latest immutable time
                ClusterSynchronizationManager.LOGGER.debug(`Setting immutable time to ${minTimestamp}`)
                this.lastImmutableTime = minTimestamp
                this.cluster.setImmutableTime(minTimestamp)
                await this.service.setImmutableTime(minTimestamp)
            }
        } finally {
            // Update flag
            this.processing = false;

            // Set the timeout again
            this.syncWithNodesTimeout = setTimeout(() => this.syncWithServers(), this.timeBetweenSyncs)

            ClusterSynchronizationManager.LOGGER.debug(`Finished syncing with servers`)
        }
    }

    /** Get all updates from one specific content server */
    private async syncWithContentServer(contentServer: ContentServerClient): Promise<void> {
        try {
            // Get new deployments on a specific content server
            const newDeployments: DeploymentHistory = await contentServer.getNewDeployments()

            // Process them
            await this.deployer.deployHistory(newDeployments, { preferredServer: contentServer })

            // Let the client know that the deployment was successful, and update the last known timestamp
            await contentServer.updateTimestamp(newDeployments[0]?.timestamp)
        } catch(error) {
            ClusterSynchronizationManager.LOGGER.error(`Failed to get new entities from content server '${contentServer.getName()}'\n${error}`)
        }
    }

    /**
     * When a node is removed from the DAO, we want to ask all other servers on the DAO if they knew something else about it
     */
    private handleServerRemoval({ serverRemoved, lastKnownTimestamp, remainingServers }): Promise<void> {
        ClusterSynchronizationManager.LOGGER.info(`Handling removal of ${serverRemoved}. It's last known timestamp is ${lastKnownTimestamp}`)

        // Prepare request
        const request = new MultiServerHistoryRequest(remainingServers, this.deployer, lastKnownTimestamp, serverRemoved)

        // Execute the request
        return request.execute()
    }

    private waitUntilSyncFinishes(): Promise<void> {
        return new Promise(async (resolve) => {
            while (this.processing) {
                await sleep(ms('1s'))
            }
            resolve()
        })
    }

}
