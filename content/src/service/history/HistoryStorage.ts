import { ContentStorage } from "../../storage/ContentStorage";
import { DeploymentHistory, DeploymentEvent } from "./HistoryManager";
import { EntityType } from "../Entity";

export class HistoryStorage {

    private static HISTORY_CATEGORY: string = "history"
    private static TEMP_HISTORY_ID: StorageFileId = "tempHistory.log"
    private static IMMUTABLE_HISTORY_ID: StorageFileId = "immutableHistory.log"
    private existingFiles: Set<StorageFileId> = new Set() // Storing files that we know to exist, to avoid some future fs calls

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

    static unserializeHistory(historyBuffer: Buffer): DeploymentHistory {
        return historyBuffer.toString()
            .trimEnd()
            .split(EventSerializer.EVENT_SEPARATOR)
            .map(EventSerializer.unserialize)
    }

    static serializeHistory(history: DeploymentHistory): Buffer {
        return Buffer.from(history.map(EventSerializer.serialize).join(EventSerializer.EVENT_SEPARATOR) + EventSerializer.EVENT_SEPARATOR)
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