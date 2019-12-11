import { Entity, EntityId, EntityType } from "./Entity";
import { File } from "./Service";
import { FileHash } from "./Hashing";

export class EntityFactory {
    static fromFile(file: File, id: EntityId): Entity {
        let object
        try {
            object = JSON.parse(file.content.toString())
        } catch (e) {
            throw new Error(`Failed to parse the entity file. Please make sure thay it is a valid json.`)
        }
        if (!object.type || !Object.values(EntityType).includes(object.type)) {
            throw new Error(`Please set a valid type. It must be one of ${Object.values(EntityType)}. We got '${object.type}'`)
        }
        if (!object.pointers || !Array.isArray(object.pointers) || !this.isPointerArray(object.pointers)) {
            throw new Error(`Please set valid pointers`)
        }
        if (!object.timestamp || (typeof object.timestamp) != "number") {
            throw new Error(`Please set a valid timestamp`)
        }

        let content: Map<string, FileHash> | undefined = undefined
        if (object.content) {
            if (!Array.isArray(object.content)) {
                throw new Error(`Expected an array as content`)
            }
            content = this.parseContent(object.content)
        }

        const type: EntityType = EntityType[object.type.toUpperCase().trim()]
        return new Entity(id, type, object.pointers, object.timestamp, content, object.metadata)
    }

    private static parseContent(contents: any[]): Map<string, FileHash> {
        const entries: [string, FileHash][] = contents.map(content => {
            if (!content.file || !content.hash) {
                throw new Error("Content must contain a file name and a file hash");
            }
            
            if (!this.isString(content.file) || !this.isString(content.hash)) {
                throw new Error("Please make sure that all file names and a file hashes are valid strings");
            }

            return [content.file, content.hash]
        })
        return new Map(entries)
    }

    private static isPointerArray <T> (array: T[]): Boolean {
        return array.map(this.isString)
            .reduce((accum, value) => accum && value)
    }

    private static isString(value: any): Boolean {
        return typeof value === 'string' || value instanceof String
    }
}
