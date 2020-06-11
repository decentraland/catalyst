import log4js from "log4js"
import { Timestamp, LegacyDeploymentHistory } from "dcl-catalyst-commons";
import { ContentServerClient } from "./clients/contentserver/ContentServerClient";
import { EventDeployer } from "./EventDeployer";
import { ContentCluster } from "./ContentCluster";
import { MultiServerHistoryRequest } from "./MultiServerHistoryRequest";
import { tryOnCluster, legacyDeploymentEventToDeploymentEventBase } from "./ClusterUtils";

export class Bootstrapper {

    private static readonly LOGGER = log4js.getLogger('Bootstrapper');

    /**
     * Start an onboarding process into the cluster. This implies syncing all missing history with the cluster's servers
     */
    static async onboardIntoCluster(cluster: ContentCluster, deployer: EventDeployer, myLastImmutableTime: Timestamp, multiServerOnboarding: boolean): Promise<void> {
        const servers: ContentServerClient[] = cluster.getAllActiveServersInCluster()

        if (servers.length > 0) {
            // Process all history, checking if the entities are already overwritten or not
            if (multiServerOnboarding) {
                return Bootstrapper.onboardIntoClusterWithManyServers(myLastImmutableTime, cluster, deployer)
            } else {
                return Bootstrapper.onboardIntoClusterWithServer(myLastImmutableTime, cluster, deployer)
            }
        } else {
            Bootstrapper.LOGGER.warn(`Couldn't find servers to bootstrap with`)
        }
    }

    private static async onboardIntoClusterWithManyServers(myLastImmutableTime: Timestamp, cluster: ContentCluster, deployer: EventDeployer): Promise<void> {
        Bootstrapper.LOGGER.info(`Will use many servers to bootstrap with`)
        try {
            // Create a request for all servers to get everything from my last immutable time
            const request = new MultiServerHistoryRequest(cluster.getAllActiveServersInCluster(), deployer, cluster, myLastImmutableTime)

            // Execute the request
            await request.execute()

            Bootstrapper.LOGGER.info("Finished bootstrapping")
        } catch (error) {
            Bootstrapper.LOGGER.error(`An error happened failed during bootstrapping: ${error}`)
        }
    }

    private static async onboardIntoClusterWithServer(myLastImmutableTime: Timestamp, cluster: ContentCluster, deployer: EventDeployer): Promise<void> {
        Bootstrapper.LOGGER.info(`Will use one server to bootstrap with`)
        try {
            // Get one (any) server's last immutable time and history
            const [immutableTime, server, legacyHistory] = await tryOnCluster(server => Bootstrapper.getImmutableHistoryOnServerFrom(myLastImmutableTime, server), cluster, 'get immutable history')

            const history = legacyHistory.map(event => legacyDeploymentEventToDeploymentEventBase(cluster, event))

            // Bootstrap
            await deployer.deployHistory(history, { logging: true })

            // Update the timestamp on the server
            await server.updateEstimatedLocalImmutableTime(immutableTime)

            // Create a request for all servers to get everything from the last immutable time
            const request = new MultiServerHistoryRequest(cluster.getAllActiveServersInCluster(), deployer, cluster, immutableTime + 1)

            // Execute the request
            await request.execute()

            Bootstrapper.LOGGER.info("Finished bootstrapping")
        } catch (error) {
            Bootstrapper.LOGGER.error(`An error happened failed during bootstrapping: ${error}`)
        }
    }

    private static async getImmutableHistoryOnServerFrom(from: Timestamp, server: ContentServerClient): Promise<[Timestamp, ContentServerClient, LegacyDeploymentHistory]> {
        // Get server's last immutable time
        const { lastImmutableTime: serversLastImmutableTime } = await server.getStatus()

        Bootstrapper.LOGGER.info(`Trying to get all history from server with name ${server.getName()}`)

        // Get everything that happened between "from" and the server's immutable time
        const history = await server.getHistory(from, undefined, serversLastImmutableTime)

        Bootstrapper.LOGGER.info(`Got all history (size was ${history.length}) from server with name ${server.getName()}`)

        return [serversLastImmutableTime, server, history]
    }
}
