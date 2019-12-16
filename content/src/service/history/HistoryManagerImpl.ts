import { Timestamp } from "../Service"
import { HistoryStorage } from "./HistoryStorage"
import { HistoryManager, DeploymentEvent, DeploymentHistory } from "./HistoryManager"
import { Entity } from "../Entity"

export class HistoryManagerImpl implements HistoryManager {

    /** This history is sorted from newest to oldest */
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

    async setTimeAsImmutable(immutableTime: number): Promise<void> {
        const tempHistory = await this.getTempHistory()
        const index = tempHistory.findIndex(savedEvent => savedEvent.timestamp <= immutableTime)
        if (index >= 0) {
            const nowImmutable: DeploymentHistory = tempHistory.splice(index, tempHistory.length - index)
                .sort((a, b) => a.timestamp - b.timestamp) // Sorting from oldest to newest
            await this.storage.setTempHistory(tempHistory)
            await this.storage.appendToImmutableHistory(nowImmutable)
        }
    }

    async getHistory(from?: Timestamp, to?: Timestamp): Promise<DeploymentHistory> {
        // TODO: We will need to find a better way to do this and avoid loading the entire file to then filter
        const tempHistory = await this.getTempHistory()
        const allHistory: DeploymentHistory = tempHistory.concat(await this.getImmutableHistory())
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

    private async getImmutableHistory(): Promise<DeploymentHistory> {
        const immutableHistory = await this.storage.getImmutableHistory()
        return immutableHistory.sort((a, b) => b.timestamp - a.timestamp) // Sorting from newest to oldest
    }

    private async getTempHistory(): Promise<DeploymentHistory> {
        if (this.tempHistory === null) {
            this.tempHistory = await this.storage.getTempHistory()
        }
        return this.tempHistory
    }

    private async addEventToTempHistory(newEvent: DeploymentEvent): Promise<void> {
        let tempHistory = await this.getTempHistory()
        const index = tempHistory.findIndex(savedEvent => savedEvent.timestamp < newEvent.timestamp)
        if (index >= 0) {
            tempHistory.splice(index, 0, newEvent)
        } else {
            tempHistory.push(newEvent)
        }
        await this.storage.setTempHistory(tempHistory)
    }
}
