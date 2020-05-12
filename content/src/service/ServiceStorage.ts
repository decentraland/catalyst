import { ContentStorage, ContentItem } from "../storage/ContentStorage"
import { ContentFileHash } from "./Hashing"

export class ServiceStorage {

    constructor(private storage: ContentStorage) { }

    storeContent(fileHash: ContentFileHash, content: Buffer): Promise<void> {
        return this.storage.store(fileHash, content)
    }

    getContent(fileHash: ContentFileHash): Promise<ContentItem | undefined> {
        return this.storage.retrieve(fileHash)
    }

    async isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>> {
        return this.storage.exist(fileHashes)
    }
}