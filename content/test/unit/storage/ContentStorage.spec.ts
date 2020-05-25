import { ContentStorageFactory } from "@katalyst/content/storage/ContentStorageFactory";
import { FileSystemUtils as fsu } from "./FileSystemUtils";
import { Environment, EnvironmentConfig } from "@katalyst/content/Environment";
import { ContentStorage } from "@katalyst/content/storage/ContentStorage";

describe("ContentStorage", () => {

    let env: Environment
    let storage: ContentStorage
    let id: string
    let content: Buffer

    beforeAll(async () => {
        env = new Environment()
        env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, fsu.createTempDirectory())
        storage = await ContentStorageFactory.local(env)

        id = "some-id"
        content = Buffer.from("123")
    })

    it(`When content is stored, then it can be retrieved`, async () => {
        await storage.store(id, content)

        const retrievedContent = await storage.retrieve(id)
        expect(await retrievedContent?.asBuffer()).toEqual(content);
    });

    it(`When content is stored, then we can check if it exists`, async function () {
        await storage.store(id, content)

        const exists = await storage.exist([id])

        expect(exists.get(id)).toBe(true)
    });

    it(`When content is stored on already existing id, then it overwrites the previous content`, async function () {
        const newContent = Buffer.from("456")

        await storage.store(id, content)
        await storage.store(id, newContent)

        const retrievedContent = await storage.retrieve(id)
        expect(await retrievedContent?.asBuffer()).toEqual(newContent);
    });

    it(`When content is deleted, then it is no longer available`, async function () {
        await storage.store(id, content)

        var exists = await storage.exist([id])
        expect(exists.get(id)).toBe(true)

        await storage.delete(id)

        exists = await storage.exist([id])
        expect(exists.get(id)).toBe(false)
    });

});
