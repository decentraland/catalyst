import { Timestamp, } from "../Service";
import { DeploymentHistory } from "../history/HistoryManager";
import { ContentServerClient } from "./clients/contentserver/ContentServerClient";
import { AuditInfo } from "../audit/Audit";
import { EventDeployer } from "./EventDeployer";
import { ContentCluster } from "./ContentCluster";
import { MultiServerHistoryRequest } from "./MultiServerHistoryRequest";

export class Bootstrapper {

    /**
     * Start an onboarding process into the cluster. This implies syncing all missing history with the cluster's servers
     */
    static async onboardIntoCluster(cluster: ContentCluster, deployer: EventDeployer, myLastImmutableTime: Timestamp): Promise<void> {
        const servers: ContentServerClient[] = cluster.getAllActiveServersInCluster()

        if (servers.length > 0) {
            // Select on server from the cluster and get all its immutable history
            const [immutableTime, history, server] = await Bootstrapper.getAllImmutableHistory(myLastImmutableTime, servers);

            // Process all history, checking if the entities are already overwritten or not
            await Bootstrapper.onboardIntoClusterWithServer(history, server, deployer)

            // Create a request for all servers to get everything from the last immutable time
            const request = new MultiServerHistoryRequest(servers, deployer, immutableTime)

            // Execute the request
            return request.execute()
        }
    }

    private static async onboardIntoClusterWithServer(history: DeploymentHistory, server: ContentServerClient, deployer: EventDeployer) {
        // Get server's last immutable time
        for (const event of history) {
            const auditInfo: AuditInfo = await server.getAuditInfo(event.entityType, event.entityId);
            if (auditInfo.overwrittenBy) {
                // Since it was already overwritten, we will only download the entity file
                return deployer.deployOverwrittenEvent(event, auditInfo, server)
            } else {
                // Process the whole deployment
                return deployer.deployEvent(event, server)
            }
        }
    }

    private static async getAllImmutableHistory(myLastImmutableTime: Timestamp, servers: ContentServerClient[]): Promise<[Timestamp, DeploymentHistory, ContentServerClient]> {
        for (const server of servers) {
            try {
                const [immutableTime, history] = await Bootstrapper.getImmutableHistoryOnServerFrom(myLastImmutableTime, server)
                return [immutableTime, history, server]
            } catch (error) { }
        }
        throw new Error(`Couldn't bootstrap, since I couldn't get connect to any other server`);
    }

    private static async getImmutableHistoryOnServerFrom(from: Timestamp, server: ContentServerClient): Promise<[Timestamp, DeploymentHistory]> {
        // Get server's last immutable time
        const { lastImmutableTime: serversLastImmutableTime } = await server.getStatus()

        // Get everything that happened between "from" and the server's immutable time
        const history = await server.getHistory(from, undefined, serversLastImmutableTime)
        return [serversLastImmutableTime, history]
    }
}
