import { Timestamp } from "../Service"
import { HistoryStorage } from "./HistoryStorage"
import { HistoryManager, DeploymentEvent, HistoryEvent, HistoryType, SnapshotEvent } from "./HistoryManager"
import { Entity } from "../Entity"

export class HistoryManagerImpl implements HistoryManager {

    private tempHistory: HistoryEvent[] | null = null

    constructor(private storage: HistoryStorage) { }

    async newEntityDeployment(entity: Entity): Promise<void> {
        const event: DeploymentEvent = new DeploymentEvent(entity.type, entity.id, entity.timestamp)
        await this.addEventToTempHistory(event)
    }

    async getHistory(from?: Timestamp, to?: Timestamp, type?: HistoryType): Promise<HistoryEvent[]> {
        // TODO: We will need to find a better way to do this and avoid loading the entire file to then filter
        const tempHistory = await this.getTempHistory()
        const allHistory: HistoryEvent[] = tempHistory.concat(await this.storage.getImmutableHistory())
        if (from || to || type) {
            return allHistory.filter((event: HistoryEvent) =>
                (!from || event.timestamp >= from) &&
                (!to || event.timestamp <= to) &&
                (!type ||
                    (type == HistoryType.DEPLOYMENT && event instanceof DeploymentEvent) ||
                    (type == HistoryType.SNAPSHOT && event instanceof SnapshotEvent)))
        } else {
            return allHistory
        }
    }

    private async getTempHistory(): Promise<HistoryEvent[]> {
        if (this.tempHistory === null) {
            this.tempHistory = await this.storage.getTempHistory()
        }
        return this.tempHistory
    }

    private async addEventToTempHistory(newEvent: HistoryEvent) {
        let tempHistory = await this.getTempHistory()
        const index = tempHistory.findIndex(savedEvent => savedEvent.timestamp > newEvent.timestamp)
        if (index >= 0) {
            tempHistory.splice(index, 0, newEvent)
        } else {
            tempHistory.push(newEvent)
        }
    }
}
