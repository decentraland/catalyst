import { HistoryManager, HistoryType, HistoryEvent } from "../../../src/service/history/HistoryManager";
import { Entity } from "../../../src/service/Entity";

export class MockedHistoryManager implements HistoryManager {

    newEntityDeployment(entity: Entity): void {
    }

    getHistory(from?: number | undefined, to?: number | undefined, type?: HistoryType): Promise<HistoryEvent[]> {
        throw new Error("Method not implemented.");
    }

}