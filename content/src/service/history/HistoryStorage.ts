import { ContentStorage } from "../../storage/ContentStorage";
import { HistoryEvent, HistoryType, DeploymentEvent } from "./HistoryManager";
import { EntityType } from "../Entity";

export class HistoryStorage {

    private static HISTORY_CATEGORY: string = "history"
    private static TEMP_HISTORY_ID: StorageFileId = "tempHistory.log"
    private static IMMUTABLE_HISTORY_ID: StorageFileId = "immutableHistory.log"
    private existingFiles: Set<StorageFileId> = new Set() // Storing files that we know to exist, to avoid some future fs calls

    constructor(private storage: ContentStorage) { }

    async setTempHistory(history: HistoryEvent[]): Promise<void> {
        await this.writeToHistoryFile(HistoryStorage.TEMP_HISTORY_ID, history)
    }

    async appendToImmutableHistory(...history: HistoryEvent[]): Promise<void> {
        await this.writeToHistoryFile(HistoryStorage.IMMUTABLE_HISTORY_ID, history, true)
    }

    getTempHistory(): Promise<HistoryEvent[]> {
        return this.readHistoryFile(HistoryStorage.TEMP_HISTORY_ID)
    }

    getImmutableHistory(): Promise<HistoryEvent[]> {
        return this.readHistoryFile(HistoryStorage.IMMUTABLE_HISTORY_ID)
    }

    private async writeToHistoryFile(fileId: StorageFileId, history: HistoryEvent[], append?: boolean) {
        await this.storage.store(HistoryStorage.HISTORY_CATEGORY, fileId, EventSerializer.serializeHistory(history), append)
    }

    private async readHistoryFile(fileId: StorageFileId): Promise<HistoryEvent[]> {
        const exists: Boolean = this.existingFiles.has(fileId) || await this.storage.exists(HistoryStorage.HISTORY_CATEGORY, fileId)
        if (exists) {
            this.existingFiles.add(fileId)
            return this.storage.getContent(HistoryStorage.HISTORY_CATEGORY, fileId)
                .then(EventSerializer.unserializeHistory)
        } else {
            return Promise.resolve([])
        }
    }

}

type StorageFileId = string;

class EventSerializer {

    private static EVENT_SEPARATOR: string = '\n'
    private static ATTRIBUTES_SEPARATOR: string = ' '

    static unserializeHistory(historyBuffer: Buffer): HistoryEvent[] {
        return historyBuffer.toString()
            .split(this.EVENT_SEPARATOR)
            .map(this.unserialize)
    }

    static serializeHistory(history: HistoryEvent[]): Buffer {
        return Buffer.from(history.map(this.serialize).join(EventSerializer.EVENT_SEPARATOR) + EventSerializer.EVENT_SEPARATOR)
    }

    private static unserialize(serializedEvent: string): HistoryEvent {
        const eventPieces: string[] = serializedEvent.split(EventSerializer.ATTRIBUTES_SEPARATOR)

        switch (eventPieces[0]) {
            case HistoryType.DEPLOYMENT:
                const[, entityType, entityId, timestamp] = eventPieces
                return new DeploymentEvent(EntityType[entityType.toUpperCase()], entityId, parseInt(timestamp))
            default:
                // TODO: Implement others
                throw new Error("Not implemented")
        }
    }

    private static serialize(event: HistoryEvent): string {
        // TODO: Avoid instance of, and implement more flexible and 'typescripty' solution
        if (event instanceof DeploymentEvent) {
            // TODO: It might make sense to try to reduce the text stored
            return [event.type, event.entityType, event.entityId, event.timestamp].join(this.ATTRIBUTES_SEPARATOR)
        } else {
            // TODO: Implement
            throw new Error("Not implemented")
        }
    }

}