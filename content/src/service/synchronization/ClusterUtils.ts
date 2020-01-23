import ms from "ms"
import { ContentServerClient } from "./clients/contentserver/ContentServerClient";
import { ContentCluster } from "./ContentCluster";


/**
 * This method tries to execute a request on all cluster servers, until one responds successfully
 */
export async function tryOnCluster<T>(execution: (server: ContentServerClient) => Promise<T>, cluster: ContentCluster, options?: { retries?: number, preferred?: ContentServerClient}): Promise<T> {
    // Re order server list
    const servers = reorderAccordingToPreference(cluster.getAllActiveServersInCluster(), options?.preferred);

    // Calculate amount of retries. Default is one
    let retries = options?.retries ?? 1

    while (retries >= 0) {
        // Try on every cluster server, until one answers the request
        for (const server of servers) {
            try {
                return await execution(server)
            } catch (error) { }
        }
        // Wait a little before retrying
        await sleep(ms("2s"))
        retries--;
        if (retries >= 0) {
            console.log("All calls to other servers failed. Going to retry.")
        }
    }

    throw new Error(`Tried to execute request on all servers on the cluster, but they all failed`)
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
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

