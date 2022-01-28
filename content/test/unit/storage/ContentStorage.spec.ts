import { createReadStream, readFileSync } from 'fs'
import { Environment, EnvironmentConfig } from '../../../src/Environment'
import { bufferToStream, ContentStorage, streamToBuffer } from '../../../src/storage/ContentStorage'
import { ContentStorageFactory } from '../../../src/storage/ContentStorageFactory'
import { FileSystemUtils as fsu } from './FileSystemUtils'

describe('ContentStorage', () => {
  let env: Environment
  let storage: ContentStorage
  let id: string
  let content: Buffer
  let id2: string
  let content2: Buffer

  beforeAll(async () => {
    env = new Environment()
    env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, fsu.createTempDirectory())
    storage = await ContentStorageFactory.local(env)

    id = 'some-id'
    content = Buffer.from('123')
    id2 = 'another-id'
    content2 = Buffer.from('456')
  })

  describe('Buffer utils', () => {
    it('unit test small', async () => {
      const b = Buffer.from('123')
      const s = bufferToStream(b)
      expect(await streamToBuffer(s)).toEqual(b)
    })
    it('unit test small uses buffer', async () => {
      const b = Buffer.from('123')
      for await (const chunk of bufferToStream(b)) {
        expect(Buffer.isBuffer(chunk)).toBe(true)
      }
    })
    it('streamToBuffer package.json', async () => {
      const stream = createReadStream(__filename)
      const raw = readFileSync(__filename)
      expect(await streamToBuffer(stream)).toEqual(raw)
    })
    it('streamToBuffer package.json uses buffer', async () => {
      for await (const chunk of createReadStream(__filename)) {
        expect(Buffer.isBuffer(chunk)).toBe(true)
      }
    })
    it('unit test big', async () => {
      const b = Buffer.from(new Uint8Array(10000000).fill(0))
      const s = bufferToStream(b)
      expect(await streamToBuffer(s)).toEqual(b)
    })
  })

  it(`When content is stored, then it can be retrieved`, async () => {
    await storage.storeStream(id, bufferToStream(content))

    await retrieveAndExpectStoredContentToBe(id, content)
  })

  it(`When content is stored, then we can check if it exists`, async function () {
    await storage.storeStream(id, bufferToStream(content))

    const exists = await storage.existMultiple([id])

    expect(exists.get(id)).toBe(true)
    expect(await storage.exist(id)).toBe(true)
  })

  it(`When content is stored on already existing id, then it overwrites the previous content`, async function () {
    const newContent = Buffer.from('456')

    await storage.storeStream(id, bufferToStream(content))
    await storage.storeStream(id, bufferToStream(newContent))

    await retrieveAndExpectStoredContentToBe(id, newContent)
  })

  it(`When content is deleted, then it is no longer available`, async function () {
    await storage.storeStream(id, bufferToStream(content))

    let exists = await storage.existMultiple([id])
    expect(exists.get(id)).toBe(true)
    expect(await storage.exist(id)).toBe(true)

    await storage.delete([id])

    exists = await storage.existMultiple([id])
    expect(await storage.exist(id)).toBe(false)
    expect(exists.get(id)).toBe(false)
  })

  it(`When multiple content is stored, then multiple content exist`, async () => {
    await storage.storeStream(id, bufferToStream(content))
    await storage.storeStream(id2, bufferToStream(content2))
    expect(await storage.existMultiple([id, id2, 'notStored'])).toEqual(
      new Map([[id, true], [id2, true], ['notStored', false]])
    )
})

  it(`When multiple content is stored, then multiple content is correct`, async () => {
    await storage.storeStream(id, bufferToStream(content))
    await storage.storeStream(id2, bufferToStream(content2))

    await retrieveAndExpectStoredContentToBe(id, content)
    await retrieveAndExpectStoredContentToBe(id2, content2)
  })

  it(`When content is deleted, then the correct contented is deleted`, async () => {
    await storage.storeStream(id, bufferToStream(content))
    await storage.storeStream(id2, bufferToStream(content2))
    await storage.delete([id2])
    expect(await storage.exist(id)).toBeTruthy()
    expect(await storage.exist(id2)).toBeFalsy()
    await retrieveAndExpectStoredContentToBe(id, content)
  })

  it(`When a content with bad compression ratio is stored and compressed, then it is not stored compressed`, async () => {
    await storage.storeStreamAndCompress(id, bufferToStream(content))
    const retrievedContent = (await storage.retrieve(id))
    expect((await retrievedContent!.asRawStream()).encoding).toBeNull()
    expect(await streamToBuffer(await retrievedContent!.asStream())).toEqual(content)

  })

  it(`When a content with good compression ratio is stored and compressed, then it is stored compressed`, async () => {
    const goodCompresstionRatioContent = Buffer.from(new Uint8Array(100).fill(0))
    await storage.storeStreamAndCompress(id, bufferToStream(goodCompresstionRatioContent))
    const retrievedContent = (await storage.retrieve(id))
    expect((await retrievedContent!.asRawStream()).encoding).toBe('gzip')
    expect(await streamToBuffer(await retrievedContent!.asStream())).toEqual(goodCompresstionRatioContent)
  })

  async function retrieveAndExpectStoredContentToBe(idToRetrieve: string, expectedContent: Buffer) {
    const retrievedContent = await storage.retrieve(idToRetrieve)
    expect(await streamToBuffer(await retrievedContent!.asStream())).toEqual(expectedContent)
  }
})
