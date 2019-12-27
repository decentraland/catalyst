import { ContentStorage } from "../../storage/ContentStorage";
import { EntityType, Pointer, EntityId } from "../Entity";

export class PointerStorage {

    private static POINTER_CATEGORY: string = "pointers"

    constructor(private storage: ContentStorage) { }

    async getActivePointers(entityType: EntityType): Promise<Pointer[]> {
        return this.storage.listIds(this.resolveCategory(entityType))
    }

    async getPointerReference(entityType: EntityType, pointer: Pointer): Promise<EntityId | undefined> {
        try {
            const buffer = await this.storage.getContent(this.resolveCategory(entityType), pointer);
            return buffer.toString();
        } catch (e) {
            return Promise.resolve(undefined)
        }
    }

    setPointerReference(entityType: EntityType, pointer: Pointer, entityId: EntityId): Promise<void> {
        return this.storage.store(this.resolveCategory(entityType), pointer, Buffer.from(entityId))
    }

    deletePointerReference(entityType: EntityType, pointer: Pointer): Promise<void> {
        return this.storage.delete(this.resolveCategory(entityType), pointer)
    }

    private resolveCategory(type: EntityType): string {
        return `${PointerStorage.POINTER_CATEGORY}-${type}`
    }

}