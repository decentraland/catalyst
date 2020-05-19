import { HistoryManager, PartialDeploymentLegacyHistory } from "@katalyst/content/service/history/HistoryManager";
import { ServerName } from "@katalyst/content/service/naming/NameKeeper";
import { Timestamp } from "@katalyst/content/service/time/TimeSorting";
import { DeploymentsRepository } from "@katalyst/content/storage/repositories/DeploymentsRepository";

export class MockedHistoryManager implements HistoryManager {

    setTimeAsImmutable(immutableTime: number): void {
    }

    reportDeployment(deploymentsRepository: DeploymentsRepository): Promise<void> {
        return Promise.resolve()
    }

    getLastImmutableTime(): Timestamp {
        return 0
    }

    getHistory(deploymentRepo: DeploymentsRepository, from?: Timestamp, to?: Timestamp, serverName?: ServerName, offset?: number, limit?: number): Promise<PartialDeploymentLegacyHistory> {
        throw new Error("Method not implemented.");
    }

    getHistorySize(): number {
        throw new Error("Method not implemented.");
    }

}