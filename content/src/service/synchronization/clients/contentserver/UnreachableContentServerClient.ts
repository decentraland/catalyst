import { EntityType, EntityId, ServerStatus, ContentFileHash, ContentFile, ServerName, Timestamp, LegacyDeploymentHistory } from "dcl-catalyst-commons";
import { Entity } from "@katalyst/content/service/Entity";
import { LegacyAuditInfo } from "../../../Audit";
import { ContentServerClient, UNREACHABLE, ConnectionState } from "./ContentServerClient";

export function getUnreachableClient(): UnreachableContentServerClient {
    return new UnreachableContentServerClient()
}

/** When a server could never be reached, we know nothing about it */
class UnreachableContentServerClient extends ContentServerClient {

    constructor() {
        super(UNREACHABLE, -1)
    }

    updateEstimatedLocalImmutableTime(timestamp: number | undefined): Promise<void> {
        return Promise.resolve()
    }

    getEntity(entityType: EntityType, entityId: EntityId): Promise<Entity> {
        throw new Error(`Server is unreachable`)
    }

    getAuditInfo(entityType: EntityType, entityId: EntityId): Promise<LegacyAuditInfo> {
        throw new Error(`Server is unreachable`)
    }

    getStatus(): Promise<ServerStatus> {
        throw new Error(`Server is unreachable`)
    }

    getContentFile(fileHash: ContentFileHash): Promise<ContentFile> {
        throw new Error(`Server is unreachable`)
    }

    getHistory(from: number, serverName?: ServerName, to?: Timestamp): Promise<LegacyDeploymentHistory> {
        return Promise.resolve([])
    }

    getConnectionState(): ConnectionState {
        return ConnectionState.NEVER_REACHED;
    }

}