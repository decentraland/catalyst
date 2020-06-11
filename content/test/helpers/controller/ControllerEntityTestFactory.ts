import { buildEntityAndFile, EntityType, Pointer, Timestamp, ContentFileHash, Entity as ControllerEntity, ContentFile } from "dcl-catalyst-commons";

/** Builds an entity with the given params, and also the file what represents it */
export async function buildControllerEntityAndFile(type: EntityType, pointers: Pointer[], timestamp: Timestamp,
    content?: Map<string, ContentFileHash>, metadata?: any): Promise<[ControllerEntity, ContentFile]> {
    const newContent = Array.from((content ?? new Map()).entries())
        .map(([file, hash]) => ({ file, hash }))
    const { entity, entityFile } = await buildEntityAndFile(type, pointers, timestamp, newContent, metadata)
    if (!entity.content || entity.content.length === 0) {
        delete entity.content
    }
    return [entity, entityFile]
}
