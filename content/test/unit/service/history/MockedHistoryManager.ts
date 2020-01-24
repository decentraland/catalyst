import { HistoryManager, DeploymentHistory } from "@katalyst/content/service/history/HistoryManager";
import { Entity } from "@katalyst/content/service/Entity";
import { ServerName } from "@katalyst/content/service/naming/NameKeeper";
import { Timestamp } from "@katalyst/content/service/time/TimeSorting";

export class MockedHistoryManager implements HistoryManager {

    getLastImmutableTime(): Promise<number | undefined> {
        return Promise.resolve(undefined)
    }

    newEntityDeployment(serverName: ServerName, entity: Entity, timestamp: Timestamp): Promise<void> {
        return Promise.resolve()
    }

    setTimeAsImmutable(immutableTime: number): Promise<void> {
        return Promise.resolve()
    }

    getHistory(from?: number, to?: number): Promise<DeploymentHistory> {
        throw new Error("Method not implemented.");
    }

    getHistorySize(): Promise<number> {
        throw new Error("Method not implemented.");
    }

}