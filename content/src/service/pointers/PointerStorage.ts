import { ContentStorage } from "../../storage/ContentStorage";
import { EntityType, Pointer, EntityId } from "../Entity";

export class PointerStorage {

    private static POINTER_CATEGORY: string = "pointers"
    private static TEMP_DEPLOYMENTS_ID: string = "temp_deploys"

    constructor(private storage: ContentStorage) { }

    async getActivePointers(entityType: EntityType): Promise<Pointer[]> {
        try {
            return await this.storage.listIds(this.resolveCategory(entityType))
        } catch (error) {
            return []
        }
    }

    async getPointerReference(entityType: EntityType, pointer: Pointer): Promise<EntityId | undefined> {
        const contentItem = await this.storage.getContent(this.resolveCategory(entityType), pointer.toLocaleLowerCase());
        if (contentItem) {
            return (await contentItem.asBuffer()).toString();
        }
        return undefined
    }

    setPointerReference(entityType: EntityType, pointer: Pointer, entityId: EntityId): Promise<void> {
        return this.storage.store(this.resolveCategory(entityType), pointer.toLocaleLowerCase(), Buffer.from(entityId))
    }

    deletePointerReference(entityType: EntityType, pointer: Pointer): Promise<void> {
        return this.storage.delete(this.resolveCategory(entityType), pointer)
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