import { EntityType, Pointer, Entity } from "../../src/service/Entity";
import { Timestamp, File } from "../../src/service/Service";
import { FileHash } from "../../src/service/Hashing";
import { ControllerEntity } from "../../src/controller/Controller";
import { buildEntityAndFile } from "../service/EntityTestFactory";
import { ControllerEntityFactory } from "../../src/controller/ControllerEntityFactory";

/** Builds an entity with the given params, and also the file what represents it */
export async function buildControllerEntityAndFile(fileName: string, type: EntityType, pointers: Pointer[], timestamp: Timestamp,
    content?: Map<string, FileHash>, metadata?: any): Promise<[ControllerEntity, File]> {
    const [entity, file]: [Entity, File] = await buildEntityAndFile(fileName, type, pointers, timestamp, content, metadata)
    return [ControllerEntityFactory.maskEntity(entity), file]
}
