import { random } from "faker"
import { EntityType, Pointer, Entity } from "../../src/service/Entity";
import { Timestamp, ContentFile, ENTITY_FILE_NAME } from "../../src/service/Service";
import { ContentFileHash, Hashing } from "../../src/service/Hashing";

/** Builds an entity with the given params, and also the file what represents it */
export async function buildEntityAndFile(type: EntityType, pointers: Pointer[], timestamp: Timestamp,
    content?: Map<string, ContentFileHash>, metadata?: any): Promise<[Entity, ContentFile]> {

    const entity: Entity = new Entity("temp-id", type, pointers, timestamp, content, metadata)
    const file: ContentFile = entityToFile(entity, ENTITY_FILE_NAME)
    const fileHash: ContentFileHash = await Hashing.calculateHash(file)
    entity.id = fileHash
    return [entity, file]
}

/** Build a file with the given entity as the content */
export function entityToFile(entity: Entity, fileName?: string): ContentFile {
    let copy: any = Object.assign({}, entity)
    copy.content = !copy.content || !(copy.content instanceof Map) ? copy.content :
        Array.from(copy.content.entries()).map(([key, value]) => ({ file: key, hash: value }))
    delete copy.id
    return { name: fileName ?? "name", content: Buffer.from(JSON.stringify(copy)) }
}

export function randomEntity(type?: EntityType): Entity {
    return new Entity(random.alphaNumeric(10), type ?? EntityType.PROFILE, [random.alphaNumeric(1)], random.number(10), undefined, random.alphaNumeric(10))
}