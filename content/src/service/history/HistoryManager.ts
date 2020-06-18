import { Timestamp, LegacyPartialDeploymentHistory, ServerName } from "dcl-catalyst-commons"
import { DeploymentsRepository } from "@katalyst/content/storage/repositories/DeploymentsRepository"

export interface HistoryManager {
    reportDeployment(deploymentsRepository: DeploymentsRepository): Promise<void>;
    getHistory(deploymentsRepository: DeploymentsRepository, from?: Timestamp, to?: Timestamp, serverName?: ServerName, offset?: number, limit?: number): Promise<LegacyPartialDeploymentHistory>;
    getHistorySize(): number;
}