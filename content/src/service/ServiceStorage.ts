import { EntityId, Entity } from "./Entity"
import { ContentStorage } from "../storage/ContentStorage"
import { EntityFactory } from "./EntityFactory"
import { FileHash } from "./Hashing"

export class ServiceStorage {

    private static CONTENT_CATEGORY = "contents"

    constructor(private storage: ContentStorage) { }

    storeContent(fileHash: FileHash, content: Buffer): Promise<void> {
        return this.storage.store(ServiceStorage.CONTENT_CATEGORY, fileHash, content)
    }

    async getContent(fileHash: FileHash): Promise<Buffer | undefined> {
        try {
            return await this.storage.getContent(ServiceStorage.CONTENT_CATEGORY, fileHash)
        } catch (error) {
            return Promise.resolve(undefined)
        }
    }

    async isContentAvailable(fileHashes: FileHash[]): Promise<Map<FileHash, Boolean>> {
        const contentsAvailableActions: Promise<[FileHash, Boolean]>[] = fileHashes.map((fileHash: FileHash) =>
            this.storage.exists(ServiceStorage.CONTENT_CATEGORY, fileHash).then(exists => [fileHash, exists]))

        return new Map(await Promise.all(contentsAvailableActions));
    }

    async getEntityById(id: EntityId): Promise<Entity | undefined> {
        try {
            const buffer = await this.storage.getContent(ServiceStorage.CONTENT_CATEGORY, id)
            return EntityFactory.fromBufferWithId(buffer, id)
        } catch (error) {
            return undefined
        }
    }
}