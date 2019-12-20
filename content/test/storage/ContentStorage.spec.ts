import { ContentStorageFactory } from "../../src/storage/ContentStorageFactory";
import { FileSystemUtils as fsu } from "./FileSystemUtils";
import { Environment, EnvironmentConfig } from "../../src/Environment";
import { ContentStorage } from "../../src/storage/ContentStorage";

describe("ContentStorage", () => {

    let env: Environment
    let storage: ContentStorage
    let category: string
    let id: string
    let content: Buffer

    beforeAll(async () => {
        env = new Environment()
        env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, fsu.createTempDirectory())
        storage = await ContentStorageFactory.local(env)

        category = "some-category"
        id = "some-id"
        content = Buffer.from("123")
    })

    it(`When content is stored, then it can be retrieved`, async () => {
        await storage.store(category, id, content)

        const retrievedContent = await storage.getContent(category, id)
        expect(retrievedContent).toEqual(content);
    });

    it(`When content is stored, then it can be listed`, async function () {
        await storage.store(category, id, content)

        const ids = await storage.listIds(category)

        expect(ids).toEqual([id])
    });

    it(`When content is stored, then we can check if it exists`, async function () {
        await storage.store(category, id, content)

        const exists = await storage.exists(category, id)

        expect(exists).toBe(true)
    });

    it(`When content is stored on already existing id, then it overwrites the previous content`, async function () {
        const newContent = Buffer.from("456")

        await storage.store(category, id, content)
        await storage.store(category, id, newContent)

        const retrievedContent = await storage.getContent(category, id)
        expect(retrievedContent).toEqual(newContent);
    });

    it(`When content is deleted, then it is no longer available`, async function () {
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
