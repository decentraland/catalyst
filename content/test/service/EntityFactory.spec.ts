import { EntityFactory } from "../../src/service/EntityFactory";
import { Entity, EntityType, EntityId } from "../../src/service/Entity";
import { File } from "../../src/service/Service";
import { buildEntityAndFile, entityToFile } from "./EntityTestFactory";

describe("Service", function() {
    
    beforeAll(async function() {
        const [entity, entityFile] = await buildEntityAndFile("fileName", EntityType.SCENE, ["X1,Y1"], 123456, new Map([["name", "hash"]]), "metadata")
        this.entity = entity
        this.entityFile = entityFile
    })

    it(`When a valid entity file is used, then it is parsed correctly`, function() {
        expect(EntityFactory.fromFile(this.entityFile, this.entity.id)).toEqual(this.entity)
    });

    it(`When the entity file can't be parsed into an entity, then an exception is thrown`, function() {
        const invalidFile: File = { name: `invalid-file`, content: Buffer.from("Hello") }
        
        assertInvalidFile(invalidFile, `id`, `Failed to parse the entity file. Please make sure thay it is a valid json.`)
    });

    it(`When type is not valid, then an exceptions is thrown`, function() {
        const invalidEntity = copyEntity(this.entity)
        invalidEntity.type = "invalidType"

        assertInvalidEntity(invalidEntity, `Please set a valid type. It must be one of ${Object.values(EntityType)}. We got '${invalidEntity.type}'`)
    });

    it(`When pointers aren't an array, then an exceptions is thrown`, function() {
        const invalidEntity = copyEntity(this.entity)
        invalidEntity.pointers = "invalidPointers"

        assertInvalidEntity(invalidEntity, `Please set valid pointers`)
    });

    it(`When pointers are an array, but with strings, then an exceptions is thrown`, function() {
        const invalidEntity = copyEntity(this.entity)
        invalidEntity.pointers = [1234]

        assertInvalidEntity(invalidEntity, `Please set valid pointers`)
    });

    it(`When timestamp is not valid, then an exceptions is thrown`, function() {
        const invalidEntity = copyEntity(this.entity)
        invalidEntity.timestamp = "invalidTimestamp"

        assertInvalidEntity(invalidEntity, `Please set a valid timestamp`)
    });

    it(`When timestamp is not valid, then an exceptions is thrown`, function() {
        const invalidEntity = copyEntity(this.entity)
        invalidEntity.timestamp = "invalidTimestamp"

        assertInvalidEntity(invalidEntity, `Please set a valid timestamp`)
    });

    it(`When content is not an array, then an exceptions is thrown`, function() {
        const invalidEntity = copyEntity(this.entity)
        invalidEntity.content = "invalidContent"

        assertInvalidEntity(invalidEntity, `Expected an array as content`)
    });

    it(`When content does not have a hash, then an exceptions is thrown`, function() {
        const invalidEntity = copyEntity(this.entity)
        invalidEntity.content = [{file: "name"}]

        assertInvalidEntity(invalidEntity, `Content must contain a file name and a file hash`)
    });

    it(`When content does not have a file, then an exceptions is thrown`, function() {
        const invalidEntity = copyEntity(this.entity)
        invalidEntity.content = [{hash: "hash"}]

        assertInvalidEntity(invalidEntity, `Content must contain a file name and a file hash`)
    });

    it(`When content file is not a string, then an exceptions is thrown`, function() {
        const invalidEntity = copyEntity(this.entity)
        invalidEntity.content = [{file: 1234, hash: "hash"}]

        assertInvalidEntity(invalidEntity, `Please make sure that all file names and a file hashes are valid strings`)
    });

    it(`When content hash is not a string, then an exceptions is thrown`, function() {
        const invalidEntity = copyEntity(this.entity)
        invalidEntity.content = [{file: "name", hash: 1234}]

        assertInvalidEntity(invalidEntity, `Please make sure that all file names and a file hashes are valid strings`)
    });
  
    function copyEntity(entity: Entity): any {
        return Object.assign({}, entity);
    }

    function assertInvalidEntity(invalidEntity: Entity, errorMessage: string) {
        assertInvalidFile(entityToFile(invalidEntity), invalidEntity.id, errorMessage)
    }

    function assertInvalidFile(file: File, entityId: EntityId, errorMessage: string) {
        expect(function() { EntityFactory.fromFile(file, entityId) } )
            .toThrowError(errorMessage)
    }
})