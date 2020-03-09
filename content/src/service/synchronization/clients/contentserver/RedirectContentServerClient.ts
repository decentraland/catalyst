import { ContentFile, ServerStatus } from "../../../Service";
import { Timestamp } from "../../../time/TimeSorting";
import { EntityType, Entity } from "../../../Entity";
import { DeploymentHistory } from "../../../history/HistoryManager";
import { ServerName } from "../../../naming/NameKeeper";
import { AuditInfo } from "../../../audit/Audit";
import { ContentServerClient, ConnectionState } from "./ContentServerClient";
import { ContentCluster } from "../../ContentCluster";
import { tryOnCluster } from "../../ClusterUtils";

export function getRedirectClient(cluster: ContentCluster, name: ServerName, lastKnownTimestamp: Timestamp): RedirectContentServerClient {
    return new RedirectContentServerClient(cluster, name, lastKnownTimestamp)
}

/**
 * When a server can't be reached for some reason, we will redirect the queries to the other reachable other servers
 * on the cluster.
 */
class RedirectContentServerClient extends ContentServerClient {

    constructor(private readonly cluster: ContentCluster,
        name: ServerName, lastKnownTimestamp: Timestamp) {
            super(name, lastKnownTimestamp)
        }

    getHistory(from: number, serverName?: ServerName, to?: Timestamp): Promise<DeploymentHistory> {
        return this.redirectCall(server => server.getHistory(from, serverName, to), `get history`)
    }

    getStatus(): Promise<ServerStatus> {
        const status = {
            name: this.name,
            version: "Unknown",
            currentTime: this.estimatedLocalImmutableTime,
            lastImmutableTime: -1,
            historySize: -1,
            commitHash: "Unknown"
        };
        return Promise.resolve(status)
    }

    getAuditInfo(entityType: EntityType, entityId: string): Promise<AuditInfo> {
        return this.redirectCall(server => server.getAuditInfo(entityType, entityId), `get audit info for (${entityType}, ${entityId})`)
    }

    getEntity(entityType: EntityType, entityId: string): Promise<Entity> {
        return this.redirectCall(server => server.getEntity(entityType, entityId), `get entity (${entityType}, ${entityId})`)
    }

    getContentFile(fileHash: string): Promise<ContentFile> {
        return this.redirectCall(server => server.getContentFile(fileHash), `get file with hash '${fileHash}'`)
    }

    updateEstimatedLocalImmutableTime(timestamp: number | undefined): Promise<void> {
        // We won't update the timestamp until we can connect to the server again
        return Promise.resolve()
    }

    getConnectionState(): ConnectionState {
        return ConnectionState.CONNECTION_LOST;
    }

    /** Redirect the call to one of the other servers. Will return the first result */
    private redirectCall<T>(call: (server: ContentServerClient) => Promise<T>, description: string) {
        return tryOnCluster(call, this.cluster, description)
    }
}
