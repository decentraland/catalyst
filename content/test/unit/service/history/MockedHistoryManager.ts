import { HistoryManager, PartialDeploymentLegacyHistory } from "@katalyst/content/service/history/HistoryManager";
import { EntityType, EntityId } from "@katalyst/content/service/Entity";
import { ServerName } from "@katalyst/content/service/naming/NameKeeper";
import { Timestamp } from "@katalyst/content/service/time/TimeSorting";

export class MockedHistoryManager implements HistoryManager {

    getLastImmutableTime(): Timestamp {
        return 0
    }

    newEntityDeployment(serverName: ServerName, entity: EntityType, entityId: EntityId, timestamp: Timestamp): Promise<void> {
        return Promise.resolve()
    }

    setTimeAsImmutable(immutableTime: number): Promise<void> {
        return Promise.resolve()
    }

    getHistory(from?: Timestamp, to?: Timestamp, serverName?: ServerName, offset?: number, limit?: number): Promise<PartialDeploymentLegacyHistory> {
        throw new Error("Method not implemented.");
    }

    getHistorySize(): number {
        throw new Error("Method not implemented.");
    }

}