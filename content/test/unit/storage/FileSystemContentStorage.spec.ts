import { FileSystemContentStorage } from "@katalyst/content/storage/FileSystemContentStorage";
import { FileSystemUtils as fsu } from "./FileSystemUtils";
import { fromBuffer } from "@katalyst/content/storage/ContentStorage";

describe("FileSystemContentStorage", () => {

    let tmpRootDir: string
    let fss: FileSystemContentStorage
    let id: string
    let content: Buffer

    beforeAll(async () => {
        tmpRootDir = fsu.createTempDirectory()
        fss = await FileSystemContentStorage.build(tmpRootDir)
        id = "some-id"
        content = Buffer.from("123")
    })

    it(`When content is stored, then the correct file structure is created`, async () => {
        await fss.store(id, fromBuffer(content))
        expect(fsu.fileExists(tmpRootDir, id)).toBe(true)
    });

    it(`When content is deleted, then the backing file is also deleted`, async () => {
        await fss.store(id, fromBuffer(content))
        expect(fsu.fileExists(tmpRootDir, id)).toBe(true)

        await fss.delete([id])
        expect(fsu.fileExists(tmpRootDir, id)).toBe(false)
    });

});

