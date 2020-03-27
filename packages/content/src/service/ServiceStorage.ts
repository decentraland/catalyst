import { EntityId, Entity } from "./Entity"
import { ContentStorage, ContentItem } from "../storage/ContentStorage"
import { EntityFactory } from "./EntityFactory"
import { ContentFileHash } from "./Hashing"

export class ServiceStorage {

    private static CONTENT_CATEGORY = "contents"

    constructor(private storage: ContentStorage) { }

    storeContent(fileHash: ContentFileHash, content: Buffer): Promise<void> {
        return this.storage.store(ServiceStorage.CONTENT_CATEGORY, fileHash, content)
    }

    getContent(fileHash: ContentFileHash): Promise<ContentItem | undefined> {
        return this.storage.getContent(ServiceStorage.CONTENT_CATEGORY, fileHash)
    }

    async isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>> {
        // TODO: Consider listing everything in dir
        const contentsAvailableActions = fileHashes.map<Promise<[ContentFileHash, boolean]>>(async (fileHash: ContentFileHash) =>
            [fileHash, await this.storage.exists(ServiceStorage.CONTENT_CATEGORY, fileHash)])

        return new Map(await Promise.all(contentsAvailableActions));
    }

    async getEntityById(id: EntityId): Promise<Entity | undefined> {
        const contentItem = await this.storage.getContent(ServiceStorage.CONTENT_CATEGORY, id)
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