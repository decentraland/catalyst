import { EntityType, Pointer, Entity } from "../../src/service/Entity";
import { Timestamp, File } from "../../src/service/Service";
import { FileHash, Hashing } from "../../src/service/Hashing";

/** Builds an entity with the given params, and also the file what represents it */
export async function buildEntityAndFile(fileName: string, type: EntityType, pointers: Pointer[], timestamp: Timestamp, 
    content?: Map<string, FileHash>, metadata?: any): Promise<[Entity, File]> {

    const entity: Entity = new Entity("temp-id", type, pointers, timestamp, content, metadata)
    const file: File = entityToFile(entity, fileName)
    const fileHash: FileHash = await Hashing.calculateHash(file)
    entity.id = fileHash
    return [entity, file]
}

/** Build a file with the given entity as the content */
export function entityToFile(entity: Entity, fileName?: string): File {
    let copy: any = Object.assign({}, entity)
    copy.content = !copy.content || !(copy.content instanceof Map) ? copy.content : 
        Array.from(copy.content.entries()).map(([key, value]) => ({ file: key, hash: value }))
    delete copy.id
    return { name: fileName ? fileName : "name", content: Buffer.from(JSON.stringify(copy)) }
}