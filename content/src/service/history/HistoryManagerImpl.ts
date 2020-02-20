import { Timestamp, sortFromNewestToOldest } from "../time/TimeSorting"
import { HistoryStorage } from "./HistoryStorage"
import { HistoryManager, DeploymentEvent, DeploymentHistory, PartialDeploymentHistory } from "./HistoryManager"
import { EntityType, EntityId } from "../Entity"
import { ServerName } from "../naming/NameKeeper"
import { happenedBeforeTime, happenedBefore, sortFromOldestToNewest } from "../time/TimeSorting"

export class HistoryManagerImpl implements HistoryManager {

    private constructor(
        private readonly storage: HistoryStorage,
        private tempHistory: DeploymentHistory, // This history is sorted from newest to oldest
        private immutableTime: Timestamp,
        private immutableHistorySize: number) { }

    static async build(storage: HistoryStorage): Promise<HistoryManager> {
        // We are adding an extra sort, because we might need to move all immutable history back to temp history externally.
        // This should be extremely rare, but if it happens, we will sort the history to fix any potential mistakes.
        const tempHistory = sortFromNewestToOldest(await storage.getTempHistory())

        const immutableHistory: DeploymentHistory = await storage.getImmutableHistory()
        const immutableTime: Timestamp = immutableHistory[immutableHistory.length - 1]?.timestamp ?? 0
        const immutableHistorySize: number = immutableHistory.length

        return new HistoryManagerImpl(storage, tempHistory, immutableTime, immutableHistorySize)
    }

    newEntityDeployment(serverName: ServerName, entityType: EntityType, entityId: EntityId, timestamp: Timestamp): Promise<void> {
        const event: DeploymentEvent = {
            serverName,
            entityType,
            entityId,
            timestamp,
        }
        this.addEventToTempHistory(event)
        return this.storage.setTempHistory(this.tempHistory)
    }

    async setTimeAsImmutable(immutableTime: number): Promise<void> {
        const index = this.tempHistory.findIndex(savedEvent => happenedBeforeTime(savedEvent, immutableTime))
        if (index >= 0) {
            const nowImmutable: DeploymentHistory = sortFromOldestToNewest(this.tempHistory.splice(index, this.tempHistory.length - index))
            await this.storage.setTempHistory(this.tempHistory)
            await this.storage.appendToImmutableHistory(nowImmutable)
            this.immutableHistorySize += nowImmutable.length
        }
        this.immutableTime = immutableTime
    }

    getLastImmutableTime(): Timestamp {
        return this.immutableTime
    }

    private static MAX_HISTORY_LIMIT = 500
    private static DEFAULT_HISTORY_LIMIT = 500
    /** Returns the history sorted from newest to oldest */
    async getHistory(from?: Timestamp, to?: Timestamp, serverName?: ServerName, offset?: number, limit?: number): Promise<PartialDeploymentHistory> {
        // TODO: We will need to find a better way to do this and avoid loading the entire file to then filter
        const allHistory: DeploymentHistory = await this.retrieveNecessaryHistory(from)
        const filteredHistory = this.filterHistory(allHistory, from, to, serverName)
        const curatedOffset = (offset && offset>=0) ? offset : 0
        const curatedLimit = (limit && limit>0 && limit<=HistoryManagerImpl.MAX_HISTORY_LIMIT) ? limit : HistoryManagerImpl.DEFAULT_HISTORY_LIMIT
        const endPositionExclusive = curatedOffset+curatedLimit
        return {
            events: filteredHistory.slice(curatedOffset, endPositionExclusive),
            filters: {
                from: from,
                to: to,
                serverName: serverName
            },
            pagination: {
                offset: curatedOffset,
                limit: curatedLimit,
                moreData: endPositionExclusive < filteredHistory.length
            }
        }
    }

    /** Returns the size for the entire history */
    getHistorySize(): number {
        return this.immutableHistorySize + this.tempHistory.length
    }

    private filterHistory(history: DeploymentHistory, from: Timestamp | undefined, to: Timestamp | undefined, serverName: ServerName | undefined): DeploymentEvent[] {
        if (from || to || serverName) {
            return history.filter((event: DeploymentEvent) =>
                (!from || event.timestamp >= from) &&
                (!to || event.timestamp <= to) &&
                (!serverName || event.serverName == serverName))
        } else {
            return history
        }
    }


    /** Before loading the immutable history, we check if it is in fact necessary */
    private async retrieveNecessaryHistory(from: Timestamp | undefined): Promise<DeploymentHistory> {
        if (!from || from <= this.immutableTime) {
            const immutableHistory = await this.storage.getImmutableHistory()
            // Reverse is used because we need to sort immutable history from newest to oldest
            return this.tempHistory.concat(immutableHistory.reverse())
        } else {
            return this.tempHistory
        }
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
