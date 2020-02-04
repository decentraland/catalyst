import { ContentStorage } from "../../storage/ContentStorage";
import { EntityType, Pointer, EntityId } from "../Entity";
import { Timestamp, happenedBefore } from "../time/TimeSorting";
import { PointerReference } from "./PointerManager";

export class PointerStorage {

    private static DELETED_ENTITY: string = "deleted"
    private static POINTER_CATEGORY: string = "pointers"
    private static TEMP_DEPLOYMENTS_ID: string = "temp_deploys.txt"

    constructor(private storage: ContentStorage) { }

    async getPointersAllFiles(entityType: EntityType): Promise<Pointer[]> {
        try {
            return await this.storage.listIds(this.resolveCategory(entityType))
        } catch (error) {
            return []
        }
    }

    async getPointerReferences(entityType: EntityType, pointer: Pointer): Promise<PointerReference[]> {
        const contentItem = await this.storage.getContent(this.resolveCategory(entityType), pointer.toLocaleLowerCase());
        if (contentItem) {
            const lines: string[] = (await contentItem.asBuffer()).toString().split('\n')
            return lines.map(line => line.split(' '))
                .map(([entityId, timestamp]) => ({ entityId, timestamp: parseInt(timestamp) }))
        }
        return []
    }

    async setPointerReferences(entityType: EntityType, pointer: Pointer, references: PointerReference[]): Promise<void> {
        const text = references.map(({ entityId, timestamp }) => `${entityId} ${timestamp}`).join('\n')
        return this.storage.store(this.resolveCategory(entityType), pointer.toLocaleLowerCase(), Buffer.from(text))
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