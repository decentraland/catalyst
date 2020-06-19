import { Timestamp, ServerName, LegacyPartialDeploymentHistory } from "dcl-catalyst-commons";
import { HistoryManager } from "@katalyst/content/service/history/HistoryManager";
import { DeploymentsRepository } from "@katalyst/content/storage/repositories/DeploymentsRepository";

export class MockedHistoryManager implements HistoryManager {

    reportDeployment(deploymentsRepository: DeploymentsRepository): Promise<void> {
        return Promise.resolve()
    }

    getHistory(deploymentRepo: DeploymentsRepository, from?: Timestamp, to?: Timestamp, serverName?: ServerName, offset?: number, limit?: number): Promise<LegacyPartialDeploymentHistory> {
        throw new Error("Method not implemented.");
    }

    getHistorySize(): number {
        throw new Error("Method not implemented.");
    }

}