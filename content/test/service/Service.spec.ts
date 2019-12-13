import { ENTITY_FILE_NAME, Timestamp, File } from "../../src/service/Service";
import { Hashing } from '../../src/service/Hashing';
import { assertPromiseRejectionIs } from "../PromiseAssertions";
import { EntityType } from "../../src/service/Entity";
import { buildEntityAndFile } from "./EntityTestFactory";
import { MockedStorage } from "../storage/MockedStorage";
import { Environment, Bean } from "../../src/Environment";
import { ServiceFactory } from "../../src/service/ServiceFactory";
import { MockedHistoryManager } from "./history/MockedHistoryManager";

describe("Service", function() {

  beforeAll(async () => {
    this.randomFile = { name: "file", content: Buffer.from("1234") }
    this.randomFileHash = await Hashing.calculateHash(this.randomFile)
    const [entity, entityFile] = await buildEntityAndFile(ENTITY_FILE_NAME, EntityType.SCENE, ["X1,Y1", "X2,Y2"], 123456, new Map([[this.randomFile.name, this.randomFileHash]]), "metadata")
    this.entityFile = entityFile
    this.entity = entity
    this.historyManager = new MockedHistoryManager()
  })

  beforeEach(() => {
    this.storage = new MockedStorage()
    const env = new Environment()
    env.registerBean(Bean.STORAGE, this.storage)
    env.registerBean(Bean.HISTORY_MANAGER, this.historyManager)
    this.service = ServiceFactory.create(env)
  })

  it(`When no file called '${ENTITY_FILE_NAME}' is uploaded, then an exception is thrown`, async () => {
    assertPromiseRejectionIs(async () => await this.service.deployEntity(new Set([this.randomFile]), this.randomFileHash, "ethAddress", "signature"),
      `Failed to find the entity file. Please make sure that it is named '${ENTITY_FILE_NAME}'.`)
  });

  it(`When two or more files called '${ENTITY_FILE_NAME}' are uploaded, then an exception is thrown`, async () => {
    const invalidEntityFile: File = { name: ENTITY_FILE_NAME, content: Buffer.from("Hello") }
    assertPromiseRejectionIs(async () => await this.service.deployEntity(new Set([this.entityFile, invalidEntityFile]), "some-id", "ethAddress", "signature"),
      `Found more than one file called '${ENTITY_FILE_NAME}'. Please make sure you upload only one with that name.`)
  });

  it(`When the entity file's hash doesn't match with the entity id, then and exception is thrown`, async () => {
    assertPromiseRejectionIs(async () => await this.service.deployEntity(new Set([this.entityFile]), this.randomFileHash, "ethAddress", "signature"),
      `Entity file's hash didn't match the signed entity id.`)
  });

  it(`When an entity is successfully deployed, then the content and pointers are stored correctly`, async () => {
    const storageSpy = spyOn(this.storage, "store").and.callThrough()
    const historySpy = spyOn(this.historyManager, "newEntityDeployment")

    const timestamp: Timestamp = await this.service.deployEntity(new Set([this.entityFile, this.randomFile]), this.entity.id, "ethAddress", "signature")
    const deltaMilliseconds = Date.now() - timestamp
    expect(deltaMilliseconds).toBeGreaterThanOrEqual(0)
    expect(deltaMilliseconds).toBeLessThanOrEqual(10)
    expect(storageSpy).toHaveBeenCalledWith("contents", this.entity.id, this.entityFile.content)
    expect(storageSpy).toHaveBeenCalledWith("contents", this.randomFileHash, this.randomFile.content)
    expect(historySpy).toHaveBeenCalledWith(this.entity, timestamp)
    this.entity.pointers.forEach(pointer =>
        expect(storageSpy).toHaveBeenCalledWith("pointers-scene", pointer, Buffer.from(this.entity.id)));
    expect(await this.service.getEntitiesByIds(EntityType.SCENE, [this.entity.id])).toEqual([this.entity])
    expect(await this.service.getEntitiesByPointers(EntityType.SCENE, this.entity.pointers)).toEqual([this.entity])
    expect(await this.service.getActivePointers(EntityType.SCENE)).toEqual(this.entity.pointers)
  });

  it(`When an entity is successfully deployed, then previous overlapping entities are deleted`, async () => {
    const storageSpy = spyOn(this.storage, "delete").and.callThrough()

    await this.service.deployEntity(new Set([this.entityFile, this.randomFile]), this.entity.id, "ethAddress", "signature")

    const [newEntity, newEntityFile] = await buildEntityAndFile(ENTITY_FILE_NAME, EntityType.SCENE, ["X2,Y2", "X3,Y3"], 123457)

    await this.service.deployEntity(new Set([newEntityFile]), newEntity.id, "ethAddress", "signature")

    expect(storageSpy).toHaveBeenCalledWith("pointers-scene", "X1,Y1")
    expect(await this.service.getEntitiesByIds(EntityType.SCENE, [this.entityId])).toEqual([])
    expect(await this.service.getEntitiesByPointers(EntityType.SCENE, ["X1,Y1", "X2,Y2"])).toEqual([newEntity])
    expect(await this.service.getActivePointers(EntityType.SCENE)).toEqual(newEntity.pointers)
  });

  it(`When a file is already uploaded, then don't try to upload it again`, async () => {
    // Consider the random file as already uploaded, but not the entity file
    spyOn(this.storage, "exists").and.callFake((_: string, id: string) => Promise.resolve(id === this.randomFileHash))
    const storeSpy = spyOn(this.storage, "store")

    await this.service.deployEntity(new Set([this.entityFile, this.randomFile]), this.entity.id, "ethAddress", "signature")

    expect(storeSpy).toHaveBeenCalledWith("contents", this.entity.id, this.entityFile.content)
    expect(storeSpy).not.toHaveBeenCalledWith("contents", this.randomFileHash, this.randomFile.content)
  });

})
