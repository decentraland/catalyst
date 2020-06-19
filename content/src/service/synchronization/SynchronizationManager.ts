import { setTimeout, clearTimeout } from "timers"
import ms from "ms";
import log4js from "log4js"
import { ContentServerClient } from "./clients/ContentServerClient";
import { ContentCluster } from "./ContentCluster";
import { EventDeployer } from "./EventDeployer";
import { delay } from "decentraland-katalyst-utils/util";
import { LastKnownDeploymentService } from "../Service";

export interface SynchronizationManager {
    start(): Promise<void>;
    stop(): Promise<void>;
    getStatus();
}

export class ClusterSynchronizationManager implements SynchronizationManager {

    private static readonly LOGGER = log4js.getLogger('ClusterSynchronizationManager');
    private syncWithNodesTimeout: NodeJS.Timeout;
    private synchronizationState: SynchronizationState = SynchronizationState.BOOTSTRAPPING
    private stopping: boolean = false

    constructor(private readonly cluster: ContentCluster,
        private readonly service: LastKnownDeploymentService,
        private readonly deployer: EventDeployer,
        private readonly timeBetweenSyncs: number) { }

    async start(): Promise<void> {
        // Make sure the stopping flag is set to false
        this.stopping = false

        // Connect to the cluster
        await this.cluster.connect(this.service)

        // Sync with other servers
        await this.syncWithServers()
    }

    stop(): Promise<void> {
        this.stopping = true
        if (this.syncWithNodesTimeout)
            clearTimeout(this.syncWithNodesTimeout)
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
        if (this.synchronizationState !== SynchronizationState.BOOTSTRAPPING) {
            this.synchronizationState = SynchronizationState.SYNCING
        }

        ClusterSynchronizationManager.LOGGER.debug(`Starting to sync with servers`)
        try {
            // Gather all servers
            const contentServers: ContentServerClient[] = this.cluster.getAllServersInCluster()

            // Fetch all new deployments
            const allDeployments = await Promise.all(contentServers.map(server => server.getNewDeployments()))

            // Process them together
            await this.deployer.processAllDeployments(allDeployments)

            // If everything worked, then update the last deployment timesamp
            contentServers.forEach(contentServer => contentServer.updateLastLocalDeploymentTimestamp())

            this.synchronizationState = SynchronizationState.SYNCED;
            ClusterSynchronizationManager.LOGGER.debug(`Finished syncing with servers`)
        } catch (error) {
            this.synchronizationState = SynchronizationState.FAILED_TO_SYNC;
            ClusterSynchronizationManager.LOGGER.warn(`Failed to sync with servers. Reason:\n${error}`)
        } finally {
            if (!this.stopping) {
                // Set the timeout again
                this.syncWithNodesTimeout = setTimeout(() => this.syncWithServers(), this.timeBetweenSyncs)
            }
        }
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
