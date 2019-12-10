import { ContentStorageFactory } from "../../src/storage/ContentStorageFactory";
import { FileSystemUtils as fsu } from "./FileSystemUtils";
import { Environment, STORAGE_ROOT_FOLDER } from "../../src/Environment";

describe("ContentStorage", function() {
  let tmpRootDir = fsu.createTempDirectory()
  console.log(`Root Tmp Dir: ${tmpRootDir}`)
  Environment.getInstance().setConfig(STORAGE_ROOT_FOLDER, tmpRootDir)
  const storage = ContentStorageFactory.local(Environment.getInstance())

  const category = "some-category"
  const id = "some-id"
  const content = Buffer.from("123")
  
  it(`When content is stored, then it can be retrieved`, async () => {
    await storage.store(category, id, content)
    
    const retrievedContent = await storage.getContent(category, id)
    expect(retrievedContent).toEqual(content);
  });

  it(`When content is stored, then it can be listed`, async () => {
    await storage.store(category, id, content)

    const ids = await storage.listIds(category)

    expect(ids).toEqual([id])
  });

  it(`When content is stored, then we can check if it exists`, async () => {
    await storage.store(category, id, content)

    const exists = await storage.exists(category, id)

    expect(exists).toBe(true)
  });

  it(`When content is stored on already existing id, then it overwrites the previous content`, async () => {
    const newContent = Buffer.from("456")
    
    await storage.store(category, id, content)
    await storage.store(category, id, newContent)

    const retrievedContent = await storage.getContent(category, id)
    expect(retrievedContent).toEqual(newContent);
  });

  it(`When content is deleted, then it is no longer available`, async () => {
    await storage.store(category, id, content)

    var exists = await storage.exists(category, id)
    expect(exists).toBe(true)

    await storage.delete(category, id)

    exists = await storage.exists(category, id)
    expect(exists).toBe(false)
    const ids = await storage.listIds(category)
    expect(ids).toEqual([])
  });

});
