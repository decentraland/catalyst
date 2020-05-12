import log4js from "log4js"
import { retry } from "@katalyst/content/helpers/FetchHelper";
import { ContentServerClient } from "./clients/contentserver/ContentServerClient";
import { ContentCluster } from "./ContentCluster";
import { LegacyDeploymentEvent } from "@katalyst/content/service/history/HistoryManager";
import { DeploymentEventBase } from "@katalyst/content/service/deployments/DeploymentManager";

const LOGGER = log4js.getLogger('ClusterUtils');

/**
 * This method tries to execute a request on all cluster servers, until one responds successfully
 */
export async function tryOnCluster<T>(execution: (server: ContentServerClient) => Promise<T>, cluster: ContentCluster, description: string, options?: { retries?: number, preferred?: ContentServerClient}): Promise<T> {
    // Re order server list
    const servers = reorderAccordingToPreference(cluster.getAllActiveServersInCluster(), options?.preferred);

    // Calculate amount of retries. Default is one
    let retries = options?.retries ?? 1

    return retry(async () => {
        // Try on every cluster server, until one answers the request
        for (const server of servers) {
            try {
                return await execution(server)
            } catch (error) {
                LOGGER.debug(`Tried to ${description} on '${server.getName()}' but it failed because of: ${error}`)
            }
        }
        throw new Error(`Tried to ${description} on all servers on the cluster, but they all failed`)
    }, retries + 1, `${description} on all servers on the cluster`, '1s');
}

export function legacyDeploymentEventToDeploymentEventBase(cluster: ContentCluster, legacyEvent: LegacyDeploymentEvent): DeploymentEventBase {
    return {
        entityType: legacyEvent.entityType,
        entityId: legacyEvent.entityId,
        originTimestamp: legacyEvent.timestamp,
        originServerUrl: cluster.getAddressForServerName(legacyEvent.serverName) ?? 'https://peer.decentraland.org/content'
    }
}

function reorderAccordingToPreference(activeServers: ContentServerClient[], preferred: ContentServerClient | undefined): ContentServerClient[] {
    if (preferred) {
        const newOrder = activeServers.filter(server => server.getName() != preferred.getName())
        newOrder.unshift(preferred);
        return newOrder
    } else {
        return activeServers
    }
}

