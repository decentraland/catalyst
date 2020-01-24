import { ContentStorage } from "../../storage/ContentStorage";
import { DeploymentHistory, DeploymentEvent } from "./HistoryManager";
import { EntityType } from "../Entity";

export class HistoryStorage {

    private static HISTORY_CATEGORY: string = "history"
    private static TEMP_HISTORY_ID: StorageFileId = "tempHistory.log"
    private static IMMUTABLE_HISTORY_ID: StorageFileId = "immutableHistory.log"

    constructor(private storage: ContentStorage) { }

    async setTempHistory(history: DeploymentHistory): Promise<void> {
        await this.writeToHistoryFile(HistoryStorage.TEMP_HISTORY_ID, history)
    }

    async appendToImmutableHistory(history: DeploymentHistory): Promise<void> {
        await this.writeToHistoryFile(HistoryStorage.IMMUTABLE_HISTORY_ID, history, true)
    }

    getTempHistory(): Promise<DeploymentHistory> {
        return this.readHistoryFile(HistoryStorage.TEMP_HISTORY_ID)
    }

    getImmutableHistory(): Promise<DeploymentHistory> {
        return this.readHistoryFile(HistoryStorage.IMMUTABLE_HISTORY_ID)
    }

    private async writeToHistoryFile(fileId: StorageFileId, history: DeploymentHistory, append?: boolean) {
        await this.storage.store(HistoryStorage.HISTORY_CATEGORY, fileId, EventSerializer.serializeHistory(history), append)
    }

    private async readHistoryFile(fileId: StorageFileId): Promise<DeploymentHistory> {
        const buffer = await this.storage.getContent(HistoryStorage.HISTORY_CATEGORY, fileId)
        if (buffer) {
            return EventSerializer.unserializeHistory(buffer)
        } else {
            return []
        }
    }

}

type StorageFileId = string;

class EventSerializer {

    private static EVENT_SEPARATOR: string = '\n'
    private static ATTRIBUTES_SEPARATOR: string = ' '

    static unserializeHistory(historyBuffer: Buffer): DeploymentHistory {
        const serializedHistory: string = historyBuffer.toString().trimEnd()
        if (serializedHistory.includes(EventSerializer.ATTRIBUTES_SEPARATOR)) {
            return serializedHistory.split(EventSerializer.EVENT_SEPARATOR)
                .map(EventSerializer.unserialize)
        } else {
            return []
        }
    }

    static serializeHistory(history: DeploymentHistory): Buffer {
        let serializedHistory: string = history.map(EventSerializer.serialize).join(EventSerializer.EVENT_SEPARATOR)
        if (history.length > 0) {
            serializedHistory += EventSerializer.EVENT_SEPARATOR
        }
        return Buffer.from(serializedHistory)
    }

    private static unserialize(serializedEvent: string): DeploymentEvent {
        const eventPieces: string[] = serializedEvent.split(EventSerializer.ATTRIBUTES_SEPARATOR)
        const [serverName, entityType, entityId, timestamp] = eventPieces
        return {
            serverName,
            entityType: EntityType[entityType.toUpperCase().trim()],
            entityId: entityId,
            timestamp: parseInt(timestamp),
        }
    }

    private static serialize(event: DeploymentEvent): string {
        return [event.serverName, event.entityType, event.entityId, event.timestamp]
            .join(EventSerializer.ATTRIBUTES_SEPARATOR)
    }

}