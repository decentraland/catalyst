import { ContentFile, ServerStatus } from "../../../Service";
import { Timestamp } from "../../../time/TimeSorting";
import { EntityId, EntityType, Entity } from "../../../Entity";
import { DeploymentHistory } from "../../../history/HistoryManager";
import { ContentFileHash } from "../../../Hashing";
import { ServerName } from "../../../naming/NameKeeper";
import { AuditInfo } from "../../../audit/Audit";
import { ContentServerClient, UNREACHABLE, ConnectionState } from "./ContentServerClient";

export function getUnreachableClient(): UnreachableContentServerClient {
    return new UnreachableContentServerClient()
}

/** When a server could never be reached, we know nothing about it */
class UnreachableContentServerClient extends ContentServerClient {

    constructor() {
        super(UNREACHABLE, -1)
    }

    updateTimestamp(timestamp: number | undefined): Promise<void> {
        return Promise.resolve()
    }

    getEntity(entityType: EntityType, entityId: EntityId): Promise<Entity> {
        throw new Error(`Server is unreachable`)
    }

    getAuditInfo(entityType: EntityType, entityId: EntityId): Promise<AuditInfo> {
        throw new Error(`Server is unreachable`)
    }

    getStatus(): Promise<ServerStatus> {
        throw new Error(`Server is unreachable`)
    }

    getContentFile(fileHash: ContentFileHash): Promise<ContentFile> {
        throw new Error(`Server is unreachable`)
    }

    getHistory(from: number, serverName?: ServerName, to?: Timestamp): Promise<DeploymentHistory> {
        return Promise.resolve([])
    }

    getConnectionState(): ConnectionState {
        return ConnectionState.NEVER_REACHED;
    }

}