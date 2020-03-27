import { random } from "faker"
import { EntityType, Pointer, Entity } from "@katalyst/content/service/Entity";
import { ContentFile, ENTITY_FILE_NAME } from "@katalyst/content/service/Service";
import { Timestamp } from "@katalyst/content/service/time/TimeSorting";
import { ContentFileHash, Hashing } from "@katalyst/content/service/Hashing";

/** Builds an entity with the given params, and also the file what represents it */
export async function buildEntityAndFile(type: EntityType, pointers: Pointer[], timestamp: Timestamp,
    content?: Map<string, ContentFileHash>, metadata?: any): Promise<[Entity, ContentFile]> {

    const entity: Entity = new Entity("temp-id", type, pointers, timestamp, content, metadata)
    const file: ContentFile = entityToFile(entity, ENTITY_FILE_NAME)
    const fileHash: ContentFileHash = await Hashing.calculateHash(file)
    const entityWithCorrectId = new Entity(fileHash, entity.type, entity.pointers.map(pointer => pointer.toLocaleLowerCase()), entity.timestamp, entity.content, entity.metadata)
    return [entityWithCorrectId, file]
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