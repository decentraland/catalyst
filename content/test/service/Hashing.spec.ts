import { Hashing, FileHash } from "../../src/service/Hashing";
import { File } from "../../src/service/Service";

describe("Hashing", function() {
  
  const content: string = "1234"
  const hash: string = "QmNazQZW3L5n8esjuAXHpY4srPVWbuQtw93FDjLSGgsCqh"

  it(`When file is hashed, then the content is hashed as expected`, async () => {
    const file: File = {name: "name", content: Buffer.from(content)}

    const hash: FileHash = await Hashing.calculateHash(file)

    expect(hash).toEqual(hash)
  });

  it(`When files are hashed, the map is built correctly`, async () => {
    const file: File = {name: "name", content: Buffer.from(content)}

    const hashes: Map<FileHash, File> = await Hashing.calculateHashes(new Set([file]))

    expect(hashes.size).toEqual(1)
    expect(hashes.get(hash)).toEqual(file)
  });

});
