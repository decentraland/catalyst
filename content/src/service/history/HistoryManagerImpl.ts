import { Timestamp } from "../Service"
import { HistoryStorage } from "./HistoryStorage"
import { HistoryManager, DeploymentEvent, DeploymentHistory } from "./HistoryManager"
import { Entity } from "../Entity"
import { ServerName } from "../naming/NameKeeper"

export class HistoryManagerImpl implements HistoryManager {

    /** This history is sorted from newest to oldest */
    private tempHistory: DeploymentHistory

    private constructor(private storage: HistoryStorage, tempHistory: DeploymentHistory) {
        this.tempHistory = tempHistory
    }

    static async build(storage: HistoryStorage): Promise<HistoryManager> {
        const tempHistory = await storage.getTempHistory()
        return new HistoryManagerImpl(storage, tempHistory)
    }

    newEntityDeployment(serverName: ServerName, entity: Entity, timestamp: Timestamp): Promise<void> {
        const event: DeploymentEvent = {
            serverName,
            entityType: entity.type,
            entityId: entity.id,
            timestamp,
        }
        this.addEventToTempHistory(event)
        // TODO: Add mutex and avoid race conditions
        return this.storage.setTempHistory(this.tempHistory)
    }

    async setTimeAsImmutable(immutableTime: number): Promise<void> {
        const index = this.tempHistory.findIndex(savedEvent => savedEvent.timestamp < immutableTime)
        if (index >= 0) {
            const nowImmutable: DeploymentHistory = this.tempHistory.splice(index, this.tempHistory.length - index)
                .sort((a, b) => a.timestamp - b.timestamp) // Sorting from oldest to newest
            await this.storage.setTempHistory(this.tempHistory)
            await this.storage.appendToImmutableHistory(nowImmutable)
        }
    }

    /** Returns the history sorted from newest to oldest */
    async getHistory(from?: Timestamp, to?: Timestamp, serverName?: ServerName): Promise<DeploymentHistory> {
        // TODO: We will need to find a better way to do this and avoid loading the entire file to then filter
        const allHistory: DeploymentHistory = this.tempHistory.concat(await this.getImmutableHistory())
        return this.filterHistory(allHistory, from, to, serverName)
    }

    private filterHistory(history: DeploymentHistory, from: Timestamp | undefined, to: Timestamp | undefined, serverName: ServerName | undefined): DeploymentHistory {
        if (from || to || serverName) {
            return history.filter((event: DeploymentEvent) =>
                (!from || event.timestamp >= from) &&
                (!to || event.timestamp <= to) &&
                (!serverName || event.serverName == serverName))
        } else {
            return history
        }
    }

    private async getImmutableHistory(): Promise<DeploymentHistory> {
        const immutableHistory = await this.storage.getImmutableHistory()
        return immutableHistory.sort((a, b) => b.timestamp - a.timestamp) // Sorting from newest to oldest
    }

    private addEventToTempHistory(newEvent: DeploymentEvent): void {
        const index = this.tempHistory.findIndex(savedEvent => savedEvent.timestamp < newEvent.timestamp || (savedEvent.timestamp == newEvent.timestamp && savedEvent.entityId < newEvent.entityId))
        if (index >= 0) {
            this.tempHistory.splice(index, 0, newEvent)
        } else {
            this.tempHistory.push(newEvent)
        }
    }
}
