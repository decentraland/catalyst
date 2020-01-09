import { Hashing, ContentFileHash } from "@katalyst/content/service/Hashing";
import { ContentFile } from "@katalyst/content/service/Service";

describe("Hashing", function () {

    const content: string = "1234"
    const hash: string = "QmNazQZW3L5n8esjuAXHpY4srPVWbuQtw93FDjLSGgsCqh"

    it(`When file is hashed, then the content is hashed as expected`, async () => {
        const file: ContentFile = { name: "name", content: Buffer.from(content) }

        const hash: ContentFileHash = await Hashing.calculateHash(file)

        expect(hash).toEqual(hash)
    });

    it(`When files are hashed, the map is built correctly`, async () => {
        const file: ContentFile = { name: "name", content: Buffer.from(content) }

        const hashes: Map<ContentFileHash, ContentFile> = await Hashing.calculateHashes([file])

        expect(hashes.size).toEqual(1)
        expect(hashes.get(hash)).toEqual(file)
    });

});
