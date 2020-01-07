import { EntityType, Pointer, Entity } from "../../src/service/Entity";
import { Timestamp, ContentFile } from "../../src/service/Service";
import { ContentFileHash } from "../../src/service/Hashing";
import { ControllerEntity } from "../../src/controller/Controller";
import { buildEntityAndFile } from "../service/EntityTestFactory";
import { ControllerEntityFactory } from "../../src/controller/ControllerEntityFactory";

/** Builds an entity with the given params, and also the file what represents it */
export async function buildControllerEntityAndFile(type: EntityType, pointers: Pointer[], timestamp: Timestamp,
    content?: Map<string, ContentFileHash>, metadata?: any): Promise<[ControllerEntity, ContentFile]> {
    const [entity, file]: [Entity, ContentFile] = await buildEntityAndFile(type, pointers, timestamp, content, metadata)
    return [ControllerEntityFactory.maskEntity(entity), file]
}
