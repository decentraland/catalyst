import { HistoryManager, DeploymentHistory } from "../../../src/service/history/HistoryManager";
import { Entity } from "../../../src/service/Entity";
import { ServerName } from "../../../src/service/naming/NameKeeper";
import { Timestamp } from "../../../src/service/Service";

export class MockedHistoryManager implements HistoryManager {

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