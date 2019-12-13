import { Timestamp } from "../Service"
import { HistoryStorage } from "./HistoryStorage"
import { HistoryManager, DeploymentEvent, DeploymentHistory } from "./HistoryManager"
import { Entity } from "../Entity"

export class HistoryManagerImpl implements HistoryManager {

    private tempHistory: DeploymentHistory | null = null

    constructor(private storage: HistoryStorage) { }

    newEntityDeployment(entity: Entity, deploymentTimestamp: Timestamp): Promise<void> {
        const event: DeploymentEvent = {
            entityType: entity.type,
            entityId: entity.id,
            timestamp: deploymentTimestamp,
        }
        return this.addEventToTempHistory(event)
    }

    setTimeAsImmutable(immutableTime: number): Promise<void> {
        throw new Error("Method not implemented.")
    }

    async getHistory(from?: Timestamp, to?: Timestamp): Promise<DeploymentHistory> {
        // TODO: We will need to find a better way to do this and avoid loading the entire file to then filter
        const tempHistory = await this.getTempHistory()
        const allHistory: DeploymentHistory = tempHistory.concat(await this.storage.getImmutableHistory())
        return this.filterHistoryByTime(allHistory, from, to)
    }

    private filterHistoryByTime(history: DeploymentHistory, from?: Timestamp, to?: Timestamp): DeploymentHistory {
        if (from || to) {
            return history.filter((event: DeploymentEvent) =>
                (!from || event.timestamp >= from) &&
                (!to || event.timestamp <= to))
        } else {
            return history
        }
    }

    private async getTempHistory(): Promise<DeploymentHistory> {
        if (this.tempHistory === null) {
            this.tempHistory = await this.storage.getTempHistory()
        }
        return this.tempHistory
    }

    private async addEventToTempHistory(newEvent: DeploymentEvent) {
        let tempHistory = await this.getTempHistory()
        const index = tempHistory.findIndex(savedEvent => savedEvent.timestamp > newEvent.timestamp)
        if (index >= 0) {
            tempHistory.splice(index, 0, newEvent)
        } else {
            tempHistory.push(newEvent)
        }
    }
}
