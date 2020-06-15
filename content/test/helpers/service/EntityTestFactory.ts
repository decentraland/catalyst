import { random } from "faker"
import { buildEntityAndFile as buildEntityAndFileHelper, EntityType, Pointer, Timestamp, ContentFile, ContentFileHash } from "dcl-catalyst-commons";
import { Entity } from "@katalyst/content/service/Entity";
import { EntityFactory } from "@katalyst/content/service/EntityFactory";

/** Builds an entity with the given params, and also the file what represents it */
export async function buildEntityAndFile(type: EntityType, pointers: Pointer[], timestamp: Timestamp,
    content?: Map<string, ContentFileHash>, metadata?: any): Promise<[Entity, ContentFile]> {
        const newContent = Array.from((content ?? new Map()).entries())
            .map(([file, hash]) => ({ file, hash }))
    const { entity, entityFile } = await buildEntityAndFileHelper(type, pointers, timestamp, newContent, metadata)
    return [EntityFactory.fromJsonObject(entity), entityFile]
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
    return { id: random.alphaNumeric(10), type: type ?? EntityType.PROFILE, pointers: [random.alphaNumeric(1)], timestamp: random.number(10), metadata: random.alphaNumeric(10) }
}