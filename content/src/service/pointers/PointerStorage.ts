import { ContentStorage } from "../../storage/ContentStorage";
import { EntityType, Pointer } from "../Entity";
import { PointerReference } from "./PointerManager";

export class PointerStorage {

    private static POINTER_CATEGORY: string = "pointers"

    constructor(private storage: ContentStorage) { }

    async getPointersAllFiles(entityType: EntityType): Promise<Pointer[]> {
        try {
            return await this.storage.listIds(this.resolveCategory(entityType))
        } catch (error) {
            return []
        }
    }

    /** References are sorted from oldest to newest */
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

    private resolveCategory(type: EntityType): string {
        return `${PointerStorage.POINTER_CATEGORY}-${type}`
    }

}