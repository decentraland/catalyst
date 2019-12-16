import { HistoryManager, DeploymentHistory } from "../../../src/service/history/HistoryManager";
import { Entity } from "../../../src/service/Entity";

export class MockedHistoryManager implements HistoryManager {

    newEntityDeployment(entity: Entity): Promise<void> {
        return Promise.resolve()
    }

    setTimeAsImmutable(immutableTime: number): Promise<void> {
        return Promise.resolve()
    }

    getHistory(from?: number, to?: number): Promise<DeploymentHistory> {
        throw new Error("Method not implemented.");
    }

}