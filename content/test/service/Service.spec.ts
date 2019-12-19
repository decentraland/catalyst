import { ENTITY_FILE_NAME, Timestamp, File } from "../../src/service/Service";
import { Hashing, FileHash } from '../../src/service/Hashing';
import { assertPromiseRejectionIs } from "../PromiseAssertions";
import { EntityType, Entity } from "../../src/service/Entity";
import { buildEntityAndFile } from "./EntityTestFactory";
import { MockedStorage } from "../storage/MockedStorage";
import { EnvironmentBuilder } from "../../src/Environment";
import { ServiceFactory } from "../../src/service/ServiceFactory";
import { MockedHistoryManager } from "./history/MockedHistoryManager";
import { NameKeeper } from "../../src/service/naming/NameKeeper";
import { ContentStorage } from "../../src/storage/ContentStorage";
import { Service } from "../../src/service/Service";
import { HistoryManager } from "../../src/service/history/HistoryManager";

describe("Service", function () {

    const serverName = "A server Name"

    let randomFile: { name: string, content: Buffer }
    let randomFileHash: FileHash
    let entity: Entity
    let entityFile: File
    let historyManager: HistoryManager
    let storage: ContentStorage
    let service: Service

    beforeAll(async () => {
        randomFile = { name: "file", content: Buffer.from("1234") }
        randomFileHash = await Hashing.calculateHash(randomFile);
        [entity, entityFile] = await buildEntityAndFile(ENTITY_FILE_NAME, EntityType.SCENE, ["X1,Y1", "X2,Y2"], Date.now(), new Map([[randomFile.name, randomFileHash]]), "metadata")
        historyManager = new MockedHistoryManager()
    })

    beforeEach(async () => {
        storage = new MockedStorage()

        const env = await new EnvironmentBuilder()
            .withStorage(storage)
            .withHistoryManager(historyManager)
            .withNameKeeper({ getServerName: () => serverName } as NameKeeper)
            .build()

        service = ServiceFactory.create(env)
    })

    it(`When no file called '${ENTITY_FILE_NAME}' is uploaded, then an exception is thrown`, async () => {
        assertPromiseRejectionIs(async () => await service.deployEntity([randomFile], randomFileHash, "ethAddress", "signature"),
            `Failed to find the entity file. Please make sure that it is named '${ENTITY_FILE_NAME}'.`)
    });

    it(`When two or more files called '${ENTITY_FILE_NAME}' are uploaded, then an exception is thrown`, async () => {
        const invalidEntityFile: File = { name: ENTITY_FILE_NAME, content: Buffer.from("Hello") }
        assertPromiseRejectionIs(async () => await service.deployEntity([entityFile, invalidEntityFile], "some-id", "ethAddress", "signature"),
            `Found more than one file called '${ENTITY_FILE_NAME}'. Please make sure you upload only one with that name.`)
    });

    it(`When the entity file's hash doesn't match with the entity id, then and exception is thrown`, async () => {
        assertPromiseRejectionIs(async () => await service.deployEntity([entityFile], randomFileHash, "ethAddress", "signature"),
            `Entity file's hash didn't match the signed entity id.`)
    });

    it(`When an entity is successfully deployed, then the content and pointers are stored correctly`, async () => {
        const storageSpy = spyOn(storage, "store").and.callThrough()
        const historySpy = spyOn(historyManager, "newEntityDeployment")

        const timestamp: Timestamp = await service.deployEntity([entityFile, randomFile], entity.id, "ethAddress", "signature")
        const deltaMilliseconds = Date.now() - timestamp
        expect(deltaMilliseconds).toBeGreaterThanOrEqual(0)
        expect(deltaMilliseconds).toBeLessThanOrEqual(10)
        expect(storageSpy).toHaveBeenCalledWith("contents", entity.id, entityFile.content)
        expect(storageSpy).toHaveBeenCalledWith("contents", randomFileHash, randomFile.content)
        expect(historySpy).toHaveBeenCalledWith(serverName, entity, timestamp)
        entity.pointers.forEach(pointer =>
            expect(storageSpy).toHaveBeenCalledWith("pointers-scene", pointer, Buffer.from(entity.id)));
        expect(await service.getEntitiesByIds(EntityType.SCENE, [entity.id])).toEqual([entity])
        expect(await service.getEntitiesByPointers(EntityType.SCENE, entity.pointers)).toEqual([entity])
        expect(await service.getActivePointers(EntityType.SCENE)).toEqual(entity.pointers)
    });

    it(`When an entity is successfully deployed, then previous overlapping entities are deleted`, async () => {
        const storageSpy = spyOn(storage, "delete").and.callThrough()

        await service.deployEntity([entityFile, randomFile], entity.id, "ethAddress", "signature")

        const [newEntity, newEntityFile] = await buildEntityAndFile(ENTITY_FILE_NAME, EntityType.SCENE, ["X2,Y2", "X3,Y3"], Date.now())

        await service.deployEntity([newEntityFile], newEntity.id, "ethAddress", "signature")

        expect(storageSpy).toHaveBeenCalledWith("pointers-scene", "X1,Y1")
        expect(await service.getEntitiesByIds(EntityType.SCENE, [entity.id])).toEqual([entity])
        expect(await service.getEntitiesByPointers(EntityType.SCENE, ["X1,Y1", "X2,Y2"])).toEqual([newEntity])
        expect(await service.getActivePointers(EntityType.SCENE)).toEqual(newEntity.pointers)
    });

    it(`When a file is already uploaded, then don't try to upload it again`, async () => {
        // Consider the random file as already uploaded, but not the entity file
        spyOn(storage, "exists").and.callFake((_: string, id: string) => Promise.resolve(id === randomFileHash))
        const storeSpy = spyOn(storage, "store")

        await service.deployEntity([entityFile, randomFile], entity.id, "ethAddress", "signature")

        expect(storeSpy).toHaveBeenCalledWith("contents", entity.id, entityFile.content)
        expect(storeSpy).not.toHaveBeenCalledWith("contents", randomFileHash, randomFile.content)
    });

})
