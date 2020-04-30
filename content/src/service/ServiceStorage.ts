import { EntityId, Entity } from "./Entity"
import { ContentStorage, ContentItem } from "../storage/ContentStorage"
import { EntityFactory } from "./EntityFactory"
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

    async getEntityById(id: EntityId): Promise<Entity | undefined> {
        const contentItem = await this.storage.retrieve(id)
        if (contentItem) {
            try {
                return EntityFactory.fromBufferWithId(await contentItem.asBuffer(), id)
            } catch {
                console.warn(`Can not convert file with id ${id} to an Entity.`)
            }
        }
        return undefined
    }
}