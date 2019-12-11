import { Service, ENTITY_FILE_NAME, Timestamp } from "../../src/service/Service";
import { Hashing } from '../../src/service/Hashing';
import { assertPromiseRejectionIs } from "../PromiseAssertions";
import { EntityType } from "../../src/service/Entity";
import { ServiceImpl } from "../../src/service/ServiceImpl";
import { buildEntityAndFile } from "./EntityTestFactory";
import { ContentStorage } from "../../src/storage/ContentStorage";
import { MockedStorage } from "../storage/MockedStorage";


describe("Service", function() {

  beforeAll(async () => {
    const [entity, entityFile] = await buildEntityAndFile(ENTITY_FILE_NAME, EntityType.SCENE, ["X1,Y1", "X2,Y2"], 123456, new Map([["1234", "QmNazQZW3L5n8esjuAXHpY4srPVWbuQtw93FDjLSGgsCqh"]]), "metadata")
    this.entityFile = entityFile
    this.entity = entity
    this.invalidEntityFile = { name: ENTITY_FILE_NAME, content: Buffer.from("Hello") }
    this.invalidEntityFileHash = await Hashing.calculateHash(this.invalidEntityFile)
    this.randomFile = { name: "file", content: Buffer.from("1234") }
    this.randomFileHash = await Hashing.calculateHash(this.randomFile)
  })

  it(`When no file called '${ENTITY_FILE_NAME}' is uploaded, then an exception is thrown`, async () => {    
    let service: Service = getServiceWithMockStorage()

    assertPromiseRejectionIs(async () => await service.deployEntity(new Set([this.randomFile]), this.randomFileHash, "ethAddress", "signature"),
      `Failed to find the entity file. Please make sure that it is named '${ENTITY_FILE_NAME}'.`)
  }); 

  it(`When two or more files called '${ENTITY_FILE_NAME}' are uploaded, then an exception is thrown`, async () => {
    let service: Service = getServiceWithMockStorage()

    assertPromiseRejectionIs(async () => await service.deployEntity(new Set([this.entityFile, this.invalidEntityFile]), "some-id", "ethAddress", "signature"),
      `Found more than one file called '${ENTITY_FILE_NAME}'. Please make sure you upload only one with that name.`)
  });

  it(`When the entity file's hash doesn't match with the entity id, then and exception is thrown`, async () => {
    let service: Service = getServiceWithMockStorage()

    assertPromiseRejectionIs(async () => await service.deployEntity(new Set([this.entityFile]), this.randomFileHash, "ethAddress", "signature"),
      `Entity file's hash didn't match the signed entity id.`)
  });

  it(`When an entity is successfully deployed, then the content and pointers are stored correctly`, async () => {    
    const storage: ContentStorage = new MockedStorage()
    const storageSpy = spyOn(storage, "store")
    let service: Service = new ServiceImpl(storage) 
    
    const timestamp: Timestamp = await service.deployEntity(new Set([this.entityFile, this.randomFile]), this.entity.id, "ethAddress", "signature")
    expect(timestamp).toBeCloseTo(Date.now())
    expect(storageSpy).toHaveBeenCalledWith("contents", this.entity.id, this.entityFile.content)
    expect(storageSpy).toHaveBeenCalledWith("contents", this.randomFileHash, this.randomFile.content)
    this.entity.pointers.forEach(pointer => 
        expect(storageSpy).toHaveBeenCalledWith("pointers-scene", pointer, Buffer.from(this.entity.id)));
    expect(await service.getEntitiesByIds(EntityType.SCENE, [this.entity.id])).toEqual([this.entity])
    expect(await service.getEntitiesByPointers(EntityType.SCENE, this.entity.pointers)).toEqual([this.entity])
    expect(await service.getActivePointers(EntityType.SCENE)).toEqual(this.entity.pointers)
  });

  it(`When an entity is successfully deployed, then previous entities are deleted`, async () => {    
    const storage: ContentStorage = new MockedStorage()
    const storageSpy = spyOn(storage, "delete")
    let service: Service = new ServiceImpl(storage) 
    
    await service.deployEntity(new Set([this.entityFile, this.randomFile]), this.entity.id, "ethAddress", "signature")

    const [newEntity, newEntityFile] = await buildEntityAndFile(ENTITY_FILE_NAME, EntityType.SCENE, ["X2,Y2", "X3,Y3"], 123457)
    
    await service.deployEntity(new Set([newEntityFile]), newEntity.id, "ethAddress", "signature")
    
    expect(storageSpy).toHaveBeenCalledWith("pointers-scene", "X1,Y1")
    expect(await service.getEntitiesByIds(EntityType.SCENE, [this.entityId])).toEqual([])
    expect(await service.getEntitiesByPointers(EntityType.SCENE, ["X1,Y1", "X2,Y2"])).toEqual([newEntity])
    expect(await service.getActivePointers(EntityType.SCENE)).toEqual(newEntity.pointers)
  });
  
  function getServiceWithMockStorage(): Service {
    const storage: ContentStorage = new MockedStorage()
    return new ServiceImpl(storage)
  }

})
