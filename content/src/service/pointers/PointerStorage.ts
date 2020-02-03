import { ContentStorage } from "../../storage/ContentStorage";
import { EntityType, Pointer, EntityId } from "../Entity";
import { Timestamp, happenedBefore } from "../time/TimeSorting";

export class PointerStorage {

    private static DELETED_ENTITY: string = "deleted"
    private static POINTER_CATEGORY: string = "pointers"
    private static TEMP_DEPLOYMENTS_ID: string = "temp_deploys.txt"

    constructor(private storage: ContentStorage) { }

    async getActivePointers(entityType: EntityType): Promise<Pointer[]> {
        try {
            const allFiles: string[] = await this.storage.listIds(this.resolveCategory(entityType))
            const pointerWithRef: [Pointer, EntityId | undefined][] = await Promise.all(allFiles.map(async pointer => [pointer, await this.getPointerReference(entityType, pointer)] as [Pointer, EntityId | undefined]))
            return pointerWithRef.filter(([, ref]) => !!ref)
                .map(([pointer]) => pointer)
        } catch (error) {
            return []
        }
    }

    async getPointerReference(entityType: EntityType, pointer: Pointer): Promise<EntityId | undefined> {
        const contentItem = await this.storage.getContent(this.resolveCategory(entityType), pointer.toLocaleLowerCase());
        if (contentItem) {
            const lines: string[] = (await contentItem.asBuffer()).toString().split('\n')
            const lastLine = lines[lines.length - 1]
            const [entityId, ] = lastLine.split(' ')
            if (entityId !== PointerStorage.DELETED_ENTITY) {
                return entityId
            }
        }
        return undefined
    }

    async setPointerReference(entityType: EntityType, pointer: Pointer, entityId: EntityId, timestamp: Timestamp): Promise<void> {
        return this.addToHistory(entityType, pointer, entityId, timestamp)
    }

    deletePointerReference(entityType: EntityType, pointer: Pointer, timestamp: Timestamp): Promise<void> {
        return this.addToHistory(entityType, pointer, PointerStorage.DELETED_ENTITY, timestamp)
    }

    private async addToHistory(entityType: EntityType, pointer: Pointer, entityId: EntityId, timestamp: Timestamp) {
        const reference = { entityId, timestamp }
        let lines: string[];
        const contentItem = await this.storage.getContent(this.resolveCategory(entityType), pointer.toLocaleLowerCase());

        if (contentItem) {
            lines = (await contentItem.asBuffer()).toString().split('\n')
            let i = lines.length - 1
            while (i >= 0) {
                const [storedEntityId, storedTimestamp] = lines[i].split(' ')
                const storedReference = { entityId: storedEntityId, timestamp: parseInt(storedTimestamp) }
                if (happenedBefore(storedReference, reference)) {
                    break;
                }
                i--;
            }
            lines.splice(i + 1, 0, `${entityId} ${timestamp}`)
        } else {
            lines = [`${entityId} ${timestamp}`]
        }
        return this.storage.store(this.resolveCategory(entityType), pointer.toLocaleLowerCase(), Buffer.from(lines.join('\n')))
    }

    storeTempDeployments(tempDeployments: Buffer): Promise<void> {
        return this.storage.store(PointerStorage.POINTER_CATEGORY, PointerStorage.TEMP_DEPLOYMENTS_ID, Buffer.from(tempDeployments))
    }

    async readStoredTempDeployments(): Promise<Buffer | undefined> {
        const contentItem = await this.storage.getContent(PointerStorage.POINTER_CATEGORY, PointerStorage.TEMP_DEPLOYMENTS_ID)
        return contentItem?.asBuffer()
    }

    private resolveCategory(type: EntityType): string {
        return `${PointerStorage.POINTER_CATEGORY}-${type}`
    }

}