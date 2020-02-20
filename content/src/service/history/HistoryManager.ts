import { Timestamp } from "../time/TimeSorting"
import { EntityType, EntityId } from "../Entity"
import { ServerName } from "../naming/NameKeeper"

export interface HistoryManager {
    newEntityDeployment(serverName: ServerName, entityType: EntityType, entityId: EntityId, timestamp: Timestamp): Promise<void>;
    setTimeAsImmutable(immutableTime: Timestamp): Promise<void>;
    getLastImmutableTime(): Timestamp;
    getHistory(from?: Timestamp, to?: Timestamp, serverName?: ServerName, offset?: number, limit?: number): Promise<PartialDeploymentHistory>;
    getHistorySize(): number;
}

export type DeploymentEvent = {
    /** The server where the user uploaded the entity */
    serverName: ServerName,
    entityType: EntityType,
    entityId: EntityId,
    /** The moment when the server validated and stored the entity */
    timestamp: Timestamp,
}

export type DeploymentHistory = DeploymentEvent[]

export type PartialDeploymentHistory = {
    events: DeploymentEvent[],
    filters: {
        from?: Timestamp,
        to?: Timestamp,
        serverName?: ServerName,
    },
    pagination: {
        offset: number,
        limit: number,
        moreData: boolean,
    },
}