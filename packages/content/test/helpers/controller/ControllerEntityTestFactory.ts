import { EntityType, Pointer, Entity } from "@katalyst/content/service/Entity";
import { ContentFile } from "@katalyst/content/service/Service";
import { Timestamp } from "@katalyst/content/service/time/TimeSorting";
import { ContentFileHash } from "@katalyst/content/service/Hashing";
import { ControllerEntity } from "@katalyst/content/controller/Controller";
import { ControllerEntityFactory } from "@katalyst/content/controller/ControllerEntityFactory";
import { buildEntityAndFile } from "../service/EntityTestFactory";

/** Builds an entity with the given params, and also the file what represents it */
export async function buildControllerEntityAndFile(type: EntityType, pointers: Pointer[], timestamp: Timestamp,
    content?: Map<string, ContentFileHash>, metadata?: any): Promise<[ControllerEntity, ContentFile]> {
    const [entity, file]: [Entity, ContentFile] = await buildEntityAndFile(type, pointers, timestamp, content, metadata)
    return [ControllerEntityFactory.maskEntity(entity), file]
}
