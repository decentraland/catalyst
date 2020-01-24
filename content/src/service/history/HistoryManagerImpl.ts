import { Timestamp } from "../time/TimeSorting"
import { HistoryStorage } from "./HistoryStorage"
import { HistoryManager, DeploymentEvent, DeploymentHistory } from "./HistoryManager"
import { Entity } from "../Entity"
import { ServerName } from "../naming/NameKeeper"
import { happenedBeforeTime, happenedBefore, sortFromOldestToNewest, sortFromNewestToOldest } from "../time/TimeSorting"

export class HistoryManagerImpl implements HistoryManager {

    /** This history is sorted from newest to oldest */
    private tempHistory: DeploymentHistory

    private immutableHistorySize: number | undefined

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
        const index = this.tempHistory.findIndex(savedEvent => happenedBeforeTime(savedEvent, immutableTime))
        if (index >= 0) {
            const nowImmutable: DeploymentHistory = sortFromOldestToNewest(this.tempHistory.splice(index, this.tempHistory.length - index))
            await this.storage.setTempHistory(this.tempHistory)
            await this.storage.appendToImmutableHistory(nowImmutable)
            if (this.immutableHistorySize) {
                this.immutableHistorySize = this.immutableHistorySize + nowImmutable.length
            }
        }
    }

    async getLastImmutableTime(): Promise<Timestamp | undefined> {
        // TODO: Avoid loading the whole file just for the last entry
        const immutableHistory: DeploymentHistory = await this.storage.getImmutableHistory()
        return immutableHistory[0]?.timestamp
    }

    /** Returns the history sorted from newest to oldest */
    async getHistory(from?: Timestamp, to?: Timestamp, serverName?: ServerName): Promise<DeploymentHistory> {
        // TODO: We will need to find a better way to do this and avoid loading the entire file to then filter
        const allHistory: DeploymentHistory = this.tempHistory.concat(await this.getImmutableHistory())
        return this.filterHistory(allHistory, from, to, serverName)
    }

    /** Returns the size for the entire history */
    async getHistorySize(): Promise<number> {
        return (await this.getImmutableHistorySize()) + this.tempHistory.length
    }

    private async getImmutableHistorySize(): Promise<number> {
        if (!this.immutableHistorySize) {
            const immutableHistory = await this.storage.getImmutableHistory()
            this.immutableHistorySize = immutableHistory.length
        }
        return this.immutableHistorySize
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

    private
    private async getImmutableHistory(): Promise<DeploymentHistory> {
        const immutableHistory = await this.storage.getImmutableHistory()
        return sortFromNewestToOldest(immutableHistory)
    }

    private addEventToTempHistory(newEvent: DeploymentEvent): void {
        // Find index where event happened before the new event
        const index = this.tempHistory.findIndex(savedEvent => happenedBefore(savedEvent, newEvent))
        if (index >= 0) {
            this.tempHistory.splice(index, 0, newEvent)
        } else {
            this.tempHistory.push(newEvent)
        }
    }
}
