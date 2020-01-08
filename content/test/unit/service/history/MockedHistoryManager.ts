import { HistoryManager, DeploymentHistory } from "@katalyst/content/src/service/history/HistoryManager";
import { Entity } from "@katalyst/content/src/service/Entity";
import { ServerName } from "@katalyst/content/src/service/naming/NameKeeper";
import { Timestamp } from "@katalyst/content/src/service/Service";

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

}