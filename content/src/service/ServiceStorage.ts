import { EntityId, Entity } from "./Entity"
import { ContentStorage } from "../storage/ContentStorage"
import { EntityFactory } from "./EntityFactory"
import { AuditInfo } from "./Service"
import { FileHash } from "./Hashing"

export class ServiceStorage {

    private static PROOF_CATEGORY = "proofs"
    private static CONTENT_CATEGORY = "contents"

    constructor(private storage: ContentStorage) { }

    storeAuditInfo(entityId: EntityId, auditInfo: AuditInfo): Promise<void> {
       return this.storage.store(ServiceStorage.PROOF_CATEGORY, entityId, Buffer.from(JSON.stringify(auditInfo)))
    }

    getAuditInfo(id: EntityId): Promise<AuditInfo | undefined> {
        try {
            return this.storage.getContent(ServiceStorage.PROOF_CATEGORY, id)
                .then(buffer => JSON.parse(buffer.toString()))
        } catch (error) {
            return Promise.resolve(undefined)
        }
    }

    storeContent(fileHash: FileHash, content: Buffer): Promise<void> {
        return this.storage.store(ServiceStorage.CONTENT_CATEGORY, fileHash, content)
    }

    getContent(fileHash: FileHash): Promise<Buffer | undefined> {
        try {
            return this.storage.getContent(ServiceStorage.CONTENT_CATEGORY, fileHash)
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