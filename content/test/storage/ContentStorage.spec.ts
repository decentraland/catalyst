import { FileSystemContentStorage } from "../../src/storage/FileSystemContentStorage";
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe("ContentStorage", function() {
  let tmpRootDir:string = fs.mkdtempSync(path.join(os.tmpdir(), 'foo-'))
  console.log(`Root Tmp Dir: ${tmpRootDir}`)
  const fss = new FileSystemContentStorage(tmpRootDir)

  const category = "some-category"
  const id = "some-id"
  const content = Buffer.from("123")
  
  it(`When content is stored, then it can be retrieved`, async () => {
    await fss.store(category, id, content)
    
    const retrievedContent = await fss.getContent(category, id)
    expect(retrievedContent).toEqual(content);
  });

  it(`When content is stored, then it can be listed`, async () => {
    await fss.store(category, id, content)

    const ids = await fss.listIds(category)

    expect(ids).toEqual([id])
  });

  it(`When content is stored, then we can check if it exists`, async () => {
    await fss.store(category, id, content)

    const exists = await fss.exists(category, id)

    expect(exists).toBeTrue
  });

  it(`When content is stored on already existing id, then it overwrites the previous content`, async () => {
    const newContent = Buffer.from("456")
    
    await fss.store(category, id, content)
    await fss.store(category, id, newContent)

    const retrievedContent = await fss.getContent(category, id)
    expect(retrievedContent).toEqual(newContent);
  });

  it(`When content is deleted, then it is no longer available`, async () => {
    await fss.store(category, id, content)

    var exists = await fss.exists(category, id)
    expect(exists).toBeTrue

    await fss.delete(category, id)

    exists = await fss.exists(category, id)
    expect(exists).toBeFalse
    const ids = await fss.listIds(category)
    expect(ids).toEqual([])
  });

});
