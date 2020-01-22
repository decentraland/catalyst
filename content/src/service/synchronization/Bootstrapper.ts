import { Timestamp } from "../time/TimeSorting";
import { DeploymentHistory } from "../history/HistoryManager";
import { ContentServerClient } from "./clients/contentserver/ContentServerClient";
import { EventDeployer } from "./EventDeployer";
import { ContentCluster } from "./ContentCluster";
import { MultiServerHistoryRequest } from "./MultiServerHistoryRequest";
import { tryOnCluster } from "./ClusterUtils";

export class Bootstrapper {

    /**
     * Start an onboarding process into the cluster. This implies syncing all missing history with the cluster's servers
     */
    static async onboardIntoCluster(cluster: ContentCluster, deployer: EventDeployer, myLastImmutableTime: Timestamp): Promise<void> {
        const servers: ContentServerClient[] = cluster.getAllActiveServersInCluster()

        if (servers.length > 0) {
            // Process all history, checking if the entities are already overwritten or not
            const immutableTime = await Bootstrapper.onboardIntoClusterWithServer(myLastImmutableTime, cluster, deployer)

            // Create a request for all servers to get everything from the last immutable time
            const request = new MultiServerHistoryRequest(servers, deployer, immutableTime)

            // Execute the request
            return request.execute()
        } else {
            console.log(`Couldn't find servers to bootstrap with`)
        }
    }

    private static async onboardIntoClusterWithServer(myLastImmutableTime: Timestamp, cluster: ContentCluster, deployer: EventDeployer): Promise<Timestamp> {
        // Get one (any) server's last immutable time and history
        const [immutableTime, history] = await tryOnCluster(server => Bootstrapper.getImmutableHistoryOnServerFrom(myLastImmutableTime, server), cluster)

        // Bootstrap
        await deployer.bootstrapWithHistory(history)

        return immutableTime
    }

    private static async getImmutableHistoryOnServerFrom(from: Timestamp, server: ContentServerClient): Promise<[Timestamp, DeploymentHistory]> {
        // Get server's last immutable time
        const { lastImmutableTime: serversLastImmutableTime } = await server.getStatus()

        // Get everything that happened between "from" and the server's immutable time
        const history = await server.getHistory(from, undefined, serversLastImmutableTime)
        return [serversLastImmutableTime, history]
    }
}
