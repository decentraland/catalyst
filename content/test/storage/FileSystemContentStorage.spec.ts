import { FileSystemContentStorage } from "../../src/storage/FileSystemContentStorage";
import { FileSystemUtils as fsu } from "./FileSystemUtils";

describe("unit tests in jasmine", () => {

    let tmpRootDir: string
    let fss: FileSystemContentStorage
    let category: string
    let id: string
    let content: Buffer

    beforeAll(async () => {
        tmpRootDir = fsu.createTempDirectory()
        fss = await FileSystemContentStorage.build(tmpRootDir)
        category = "some-category"
        id = "some-id"
        content = Buffer.from("123")
    })

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

