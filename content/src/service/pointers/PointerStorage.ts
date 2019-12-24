import { ContentStorage } from "../../storage/ContentStorage";
import { EntityType, Pointer } from "../Entity";
import { EntityReference } from "./PointerManager";

export class PointerStorage {

    private static POINTER_CATEGORY: string = "POINTERS"

    constructor(private storage: ContentStorage) { }

    async getReference(pointer: Pointer, entityType: EntityType): Promise<EntityReference | undefined> {
        try {
            const content: Buffer = await this.storage.getContent(this.resolveCategory(entityType), pointer)
            return JSON.parse(content.toString())
        } catch (e) {
            return Promise.resolve(undefined)
        }
    }

    setReference(pointer: Pointer, entityType: EntityType, entityDeployment: EntityReference): Promise<void> {
        return this.storage.store(this.resolveCategory(entityType), pointer, Buffer.from(JSON.stringify(entityDeployment)))
    }

    async getReferences(entityType: EntityType): Promise<Pointer[]> {
        // TODO: Improve, please. This is super slow
        const pointerFiles = await this.storage.listIds(this.resolveCategory(entityType))
        const readActions = pointerFiles.map(pointer => this.getReference(pointer, entityType))
        return (await Promise.all(readActions))
            .filter((reference): reference is EntityReference => !!reference)
            .filter(reference => reference.active)
            .map(reference => reference.pointers)
            .reduce((accum, currentValue) => accum.concat(currentValue), [])
            .filter((elem, pos, array) => array.indexOf(elem) == pos) // Removing duplicates. Quickest way to do so.
    }


    private resolveCategory(type: EntityType): string {
        return `${PointerStorage.POINTER_CATEGORY}-${type}`
    }

}