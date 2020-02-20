import log4js from "log4js"
import { Timestamp } from "../time/TimeSorting";
import { DeploymentHistory } from "../history/HistoryManager";
import { ContentServerClient } from "./clients/contentserver/ContentServerClient";
import { EventDeployer } from "./EventDeployer";
import { ContentCluster } from "./ContentCluster";
import { MultiServerHistoryRequest } from "./MultiServerHistoryRequest";
import { tryOnCluster } from "./ClusterUtils";
import { getClient } from "./clients/contentserver/ActiveContentServerClient";
import { FetchHelper } from "@katalyst/content/helpers/FetchHelper";

export class Bootstrapper {

    private static readonly LOGGER = log4js.getLogger('Bootstrapper');

    /**
     * Start an onboarding process into the cluster. This implies syncing all missing history with the cluster's servers
     */
    static async onboardIntoCluster(cluster: ContentCluster, deployer: EventDeployer, myLastImmutableTime: Timestamp): Promise<void> {
        const servers: ContentServerClient[] = cluster.getAllActiveServersInCluster()

        if (servers.length > 0) {
            // Process all history, checking if the entities are already overwritten or not
            const immutableTime = await Bootstrapper.onboardIntoClusterWithServer(myLastImmutableTime, cluster, deployer)

            // Create a request for all servers to get everything from the last immutable time
            const request = new MultiServerHistoryRequest(servers, deployer, immutableTime + 1)

            // Execute the request
            return request.execute()
        } else {
            Bootstrapper.LOGGER.warn(`Couldn't find servers to bootstrap with`)
        }
    }

    private static async onboardIntoClusterWithServer(myLastImmutableTime: Timestamp, cluster: ContentCluster, deployer: EventDeployer): Promise<Timestamp> {
        try {
            // Get one (any) server's last immutable time and history
            const [immutableTime, server, history] = await tryOnCluster(server => Bootstrapper.getImmutableHistoryOnServerFrom(myLastImmutableTime, server), cluster)

            // Bootstrap
            if (process.env.PREFERRED_BOOTSTRAP_NODE) {
                const client = getClient(new FetchHelper(), process.env.PREFERRED_BOOTSTRAP_NODE, "name", 0)
                await deployer.deployHistory(history, { logging: true, preferredServer: client})
            } else {
                await deployer.deployHistory(history, { logging: true })
            }

            // Update the timestamp on the server
            await server.updateEstimatedLocalImmutableTime(immutableTime)

            Bootstrapper.LOGGER.info("Finished bootstrapping")
            return immutableTime
        } catch (error) {
            Bootstrapper.LOGGER.error(`An error happened failed during bootstrapping: ${error}`)
            return -1
        }
    }

    private static async getImmutableHistoryOnServerFrom(from: Timestamp, server: ContentServerClient): Promise<[Timestamp, ContentServerClient, DeploymentHistory]> {
        // Get server's last immutable time
        const { lastImmutableTime: serversLastImmutableTime } = await server.getStatus()

        Bootstrapper.LOGGER.info(`Trying to get all history from server with name ${server.getName()}`)

        // Get everything that happened between "from" and the server's immutable time
        const history = await server.getHistory(from, undefined, serversLastImmutableTime)

        Bootstrapper.LOGGER.info(`Got all history (size was ${history.length}) from server with name ${server.getName()}`)

        return [serversLastImmutableTime, server, history]
    }
}
