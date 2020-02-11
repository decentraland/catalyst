import { ContentFile, ServerStatus } from "../../../Service";
import { Timestamp } from "../../../time/TimeSorting";
import { EntityId, EntityType, Entity } from "../../../Entity";
import { DeploymentHistory } from "../../../history/HistoryManager";
import { ContentFileHash } from "../../../Hashing";
import { ServerName } from "../../../naming/NameKeeper";
import { AuditInfo } from "../../../audit/Audit";
import { FetchHelper } from "@katalyst/content/helpers/FetchHelper";

export const UNREACHABLE: string = "UNREACHABLE"

export abstract class ContentServerClient {

    constructor(protected readonly name: ServerName,
        protected lastKnownTimestamp: Timestamp) { }

    getNewDeployments(): Promise<DeploymentHistory> {
        return this.getHistory(this.lastKnownTimestamp + 1, this.name)
    }

    getLastKnownTimestamp(): Timestamp {
        return this.lastKnownTimestamp
    }

    getName(): ServerName {
        return this.name
    }

    /** Update the last known timestamp */
    abstract updateTimestamp(timestamp: Timestamp | undefined): Promise<void>;
    abstract getEntity(entityType: EntityType, entityId: EntityId): Promise<Entity>;
    abstract getContentFile(fileHash: ContentFileHash): Promise<ContentFile>;
    abstract getAuditInfo(entityType: EntityType, entityId: EntityId): Promise<AuditInfo>;
    abstract getStatus(): Promise<ServerStatus>;
    abstract getHistory(from: number, serverName?: ServerName, to?: Timestamp): Promise<DeploymentHistory>;
    abstract getConnectionState(): ConnectionState;
}

/** Return the server's name, or the text "UNREACHABLE" it it couldn't be reached */
export async function getServerName(address: ServerAddress): Promise<ServerName> {
    try {
        const { name } = await FetchHelper.fetchJson(`${address}/status`)
        return name
    } catch (error) {
        return UNREACHABLE
    }
}

export enum ConnectionState {
    CONNECTED = "Connected",
    CONNECTION_LOST = "Connection lost",
    NEVER_REACHED = "Could never be reached",
}

export type ServerAddress = string
