import { ContentStorage } from "../../src/storage/ContentStorage";
import { Service, ENTITY_FILE_NAME, Timestamp } from "../../src/service/Service";
import { Hashing } from '../../src/service/Hashing';
import { assertPromiseRejectionIs, assertPromiseRejectionContains } from "../PromiseAssertions";
import { EntityType, Entity } from "../../src/service/Entity";
import { ServiceImpl } from "../../src/service/ServiceImpl";

describe("Service", function() {
  
  // TODO: Move to a resources file or similar
  const entityFileContent: string = `{ 
    "type": "scene", 
    "pointers": ["X1,Y1", "X2,Y2"], 
    "timestamp": 123456, 
    "metadata": "metadata",
    "content": [
        {
            "file": "1234",
            "hash": "QmNazQZW3L5n8esjuAXHpY4srPVWbuQtw93FDjLSGgsCqh"
        }
    ]
  }`

  beforeAll(async () => {
    this.entityFile = { name: ENTITY_FILE_NAME, content: Buffer.from(entityFileContent)}  
    this.entityId = await Hashing.calculateHash(this.entityFile)
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

  it(`When the entity file can't be parsed into an entity, then an exception is thrown`, async () => {
    let service: Service = getServiceWithMockStorage()
    
    assertPromiseRejectionContains(async () => await service.deployEntity(new Set([this.invalidEntityFile]), this.invalidEntityFileHash, "ethAddress", "signature"),
      `Failed to parse the entity file. Please make sure thay it is a valid json.`)
  });

  it(`When an entity is successfully deployed, then the files and pointers are stored correctly`, async () => {    
    const storage: ContentStorage = new MockStorage()
    const storageSpy = spyOn(storage, "store")
    let service: Service = new ServiceImpl(storage) 
    
    const timestamp: Timestamp = await service.deployEntity(new Set([this.entityFile, this.randomFile]), this.entityId, "ethAddress", "signature")
    expect(timestamp).toBeCloseTo(Date.now())
    expect(storageSpy).toHaveBeenCalledWith("contents", this.entityId, this.entityFile.content)
    expect(storageSpy).toHaveBeenCalledWith("contents", this.randomFileHash, this.randomFile.content)
    expect(storageSpy).toHaveBeenCalledWith("pointers-scene", "X1,Y1", Buffer.from(this.entityId))
    expect(storageSpy).toHaveBeenCalledWith("pointers-scene", "X2,Y2", Buffer.from(this.entityId))

    const entity: Entity = Entity.fromFile(this.entityFile, this.entityId);

    expect(await service.getEntitiesByIds(EntityType.SCENE, [this.entityId])).toEqual([entity])
    expect(await service.getEntitiesByPointers(EntityType.SCENE, ["X1,Y1", "X2,Y2"])).toEqual([entity])
    expect(await service.getActivePointers(EntityType.SCENE)).toEqual(["X1,Y1", "X2,Y2"])
  });

  function getServiceWithMockStorage(): Service {
    const storage: ContentStorage = new MockStorage()
    return new ServiceImpl(storage)
  }

})

  /**      
   * 5. Verificar que se llamó al storage y que los gets funcionan
   * 6. Verificar que se pisa una entity 
   */

class MockStorage implements ContentStorage {
  store(category: string, id: string, content: Buffer, append?: boolean | undefined): Promise<void> {
    return Promise.resolve()
  }  
  delete(category: string, id: string): Promise<void> {
    return Promise.resolve()
  }
  getContent(category: string, id: string): Promise<Buffer> {
    throw new Error("Method not implemented.");
  }
  listIds(category: string): Promise<string[]> {
    throw new Error("Method not implemented.");
  }
  exists(category: string, id: string): Promise<boolean> {
    throw new Error("Method not implemented.");
  }
}