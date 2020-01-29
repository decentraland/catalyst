import { setInterval, clearInterval } from "timers"
import { TimeKeepingService } from "../Service";
import { Timestamp } from "../time/TimeSorting";
import { DeploymentHistory } from "../history/HistoryManager";
import { ContentServerClient } from "./clients/contentserver/ContentServerClient";
import { ContentCluster } from "./ContentCluster";
import { EventDeployer } from "./EventDeployer";
import { MultiServerHistoryRequest } from "./MultiServerHistoryRequest";
import { Bootstrapper } from "./Bootstrapper";
import { Disposable } from "./events/ClusterEvent";

export interface SynchronizationManager {
    start(): Promise<void>;
    stop(): Promise<void>;
}

export class ClusterSynchronizationManager implements SynchronizationManager {

    private syncWithNodesInterval: NodeJS.Timeout;
    private daoRemovalEventSubscription: Disposable
    private lastImmutableTime = 0

    constructor(private readonly cluster: ContentCluster,
        private readonly service: TimeKeepingService,
        private readonly deployer: EventDeployer,
        private readonly syncWithServersInterval: number) { }

    async start(): Promise<void> {
        // Read immutable time from the history I have
        this.lastImmutableTime = this.service.getLastImmutableTime()

        // Connect to the cluster
        await this.cluster.connect(this.lastImmutableTime)

        // Register to listen to when a server is removed from the DAO
        this.daoRemovalEventSubscription =  this.cluster.listenToRemoval(removal => this.handleServerRemoval(removal));

        // Onboard into cluster
        await Bootstrapper.onboardIntoCluster(this.cluster, this.deployer, this.lastImmutableTime)

        // Set an interval to stay in sync with other servers
        this.syncWithNodesInterval = setInterval(() => this.syncWithServers(), this.syncWithServersInterval)
    }

    stop(): Promise<void> {
        clearInterval(this.syncWithNodesInterval)
        this.daoRemovalEventSubscription?.dispose()
        this.cluster.disconnect()
        return Promise.resolve()
    }

    private async syncWithServers(): Promise<void> {
        // Gather all servers
        const contentServers: ContentServerClient[] = this.cluster.getAllServersInCluster()

        // Fetch and process new deployments
        await Promise.all(contentServers.map(server => this.syncWithContentServer(server)))

        // Find the minimum timestamp between all servers
        const minTimestamp: Timestamp = contentServers.map(contentServer => contentServer.getLastKnownTimestamp())
            .reduce((min, current) => Math.min(min, current), Date.now())

        if (minTimestamp > this.lastImmutableTime) {
            // Set this new minimum timestamp as the latest immutable time
            console.log(`Setting immutable time to ${minTimestamp}`)
            this.lastImmutableTime = minTimestamp
            this.cluster.setImmutableTime(minTimestamp)
            await this.service.setImmutableTime(minTimestamp)
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
            console.error(`Failed to get new entities from content server '${contentServer.getName()}'\n${error}`)
        }
    }

    /**
     * When a node is removed from the DAO, we want to ask all other servers on the DAO if they knew something else about it
     */
    private handleServerRemoval({ serverRemoved, lastKnownTimestamp, remainingServers }): Promise<void> {
        console.log(`Handling removal of ${serverRemoved}. It's last known timestamp is ${lastKnownTimestamp}`)

        // Prepare request
        const request = new MultiServerHistoryRequest(remainingServers, this.deployer, lastKnownTimestamp, serverRemoved)

        // Execute the request
        return request.execute()
    }

}
