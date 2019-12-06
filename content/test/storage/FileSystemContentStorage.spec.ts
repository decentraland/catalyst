import { FileSystemContentStorage } from "../../src/storage/FileSystemContentStorage";
import { FileSystemUtils as fsu } from "./FileSystemUtils";

describe("unit tests in jasmine", function() {
  let tmpRootDir = fsu.createTempDirectory()
  console.log(`Root Tmp Dir: ${tmpRootDir}`)

  const fss = new FileSystemContentStorage(tmpRootDir)

  const category = "some-category"
  const id = "some-id"
  const content = Buffer.from("123")

  it(`When content is stored, then the correct file structure is created`, async () => {
    await fss.store(category, id, content)
    expect(fsu.directoryExists(tmpRootDir, category)).toBe(true)
    expect(fsu.fileExists(tmpRootDir, category, id)).toBe(true)
  });

  it(`When content is deleted, then the backing file is also deleted`, async () => {
    await fss.store(category, id, content)
    expect(fsu.fileExists(tmpRootDir, category, id)).toBe(true)

    await fss.delete(category, id)
    expect(fsu.fileExists(tmpRootDir, category, id)).toBe(false)
  });

});

