import { ContentFile, ServerStatus } from "../../../Service";
import { Timestamp } from "../../../time/TimeSorting";
import { EntityId, EntityType, Entity } from "../../../Entity";
import { DeploymentHistory } from "../../../history/HistoryManager";
import { ContentFileHash } from "../../../Hashing";
import { ServerName } from "../../../naming/NameKeeper";
import { AuditInfo } from "../../../audit/Audit";

export const UNREACHABLE: string = "UNREACHABLE"

export abstract class ContentServerClient {

    constructor(protected readonly name: ServerName,
        protected estimatedLocalImmutableTime: Timestamp) { }

    getNewDeployments(): Promise<DeploymentHistory> {
        return this.getHistory(this.estimatedLocalImmutableTime + 1, this.name)
    }

    getEstimatedLocalImmutableTime(): Timestamp {
        return this.estimatedLocalImmutableTime
    }

    getName(): ServerName {
        return this.name
    }

    /** Update the estimated immutable timestamp */
    abstract updateEstimatedLocalImmutableTime(timestamp: Timestamp | undefined): Promise<void>;
    abstract getEntity(entityType: EntityType, entityId: EntityId): Promise<Entity>;
    abstract getContentFile(fileHash: ContentFileHash): Promise<ContentFile>;
    abstract getAuditInfo(entityType: EntityType, entityId: EntityId): Promise<AuditInfo>;
    abstract getStatus(): Promise<ServerStatus>;
    abstract getHistory(from: number, serverName?: ServerName, to?: Timestamp): Promise<DeploymentHistory>;
    abstract getConnectionState(): ConnectionState;
}

export enum ConnectionState {
    CONNECTED = "Connected",
    CONNECTION_LOST = "Connection lost",
    NEVER_REACHED = "Could never be reached",
}

export type ServerAddress = string
