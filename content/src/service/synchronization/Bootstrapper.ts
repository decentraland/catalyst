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
            // Process all history, checking if the entities are already overwritten or not
            const immutableTime = await Bootstrapper.onboardIntoClusterWithServer(myLastImmutableTime, servers, deployer)

            // Create a request for all servers to get everything from the last immutable time
            const request = new MultiServerHistoryRequest(servers, deployer, immutableTime)

            // Execute the request
            return request.execute()
        }
    }

    private static async onboardIntoClusterWithServer(myLastImmutableTime: Timestamp, servers: ContentServerClient[], deployer: EventDeployer): Promise<Timestamp> {
        for (const server of servers) {
            try {
                // Get immutable history from server
                const [immutableTime, history] = await Bootstrapper.getImmutableHistoryOnServerFrom(myLastImmutableTime, server)

                // Get server's last immutable time
                for (const event of history) {
                    const auditInfo: AuditInfo = await server.getAuditInfo(event.entityType, event.entityId);
                    if (auditInfo.overwrittenBy) {
                        // Since it was already overwritten, we will only download the entity file
                        await deployer.deployOverwrittenEvent(event, auditInfo, server)
                    } else {
                        // Process the whole deployment
                        await deployer.deployEvent(event, server)
                    }
                }
                return immutableTime
            } catch (error) { }
        }
        throw new Error(`Couldn't bootstrap, since I couldn't connect sync with any other server`);
    }

    private static async getImmutableHistoryOnServerFrom(from: Timestamp, server: ContentServerClient): Promise<[Timestamp, DeploymentHistory]> {
        // Get server's last immutable time
        const { lastImmutableTime: serversLastImmutableTime } = await server.getStatus()

        // Get everything that happened between "from" and the server's immutable time
        const history = await server.getHistory(from, undefined, serversLastImmutableTime)
        return [serversLastImmutableTime, history]
    }
}
