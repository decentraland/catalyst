import { FileSystemStorage } from "../src/FileSystemStorage";
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe("tests FileSystemStorage", function() {
  console.log("Testing...")
  let tmpRootDir:string = fs.mkdtempSync(path.join(os.tmpdir(), 'foo-'))
  console.log(`Root Tmp Dir: ${tmpRootDir}`)
  const fss = new FileSystemStorage(tmpRootDir)
  
  it(`can store and retrieve elements`, async () => {
    const category = "some-category"
    const id = "some-id"
    const content = Buffer.from("123")
    
    await fss.store(category, id, content)
    
    const retrievedContent = await fss.getContent(category, id)

    expect(retrievedContent).toEqual(content);

    const ids = await fss.listIds(category)

    expect(ids).toEqual([id])
  });
});
