import { Timestamp } from "../time/TimeSorting"
import { EntityType, EntityId } from "../Entity"
import { ServerName } from "../naming/NameKeeper"
import { DeploymentsRepository } from "@katalyst/content/storage/repositories/DeploymentsRepository"

export interface HistoryManager {
    reportDeployment(): void;
    setTimeAsImmutable(immutableTime: Timestamp): void;
    getLastImmutableTime(): Timestamp;
    getHistory(deploymentsRepository: DeploymentsRepository, from?: Timestamp, to?: Timestamp, serverName?: ServerName, offset?: number, limit?: number): Promise<PartialDeploymentLegacyHistory>;
    getHistorySize(): number;
}

export type LegacyDeploymentEvent = {
    /** The server where the user uploaded the entity */
    serverName: ServerName,
    entityType: EntityType,
    entityId: EntityId,
    /** The moment when the server validated and stored the entity */
    timestamp: Timestamp,
}

export type LegacyDeploymentHistory = LegacyDeploymentEvent[]

export type PartialDeploymentLegacyHistory = {
    events: LegacyDeploymentEvent[],
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