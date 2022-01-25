import { Environment, EnvironmentConfig } from '../../../src/Environment'
import { bufferToStream, ContentStorage, streamToBuffer } from '../../../src/storage/ContentStorage'
import { ContentStorageFactory } from '../../../src/storage/ContentStorageFactory'
import { FileSystemUtils as fsu } from './FileSystemUtils'

describe('ContentStorage', () => {
  let env: Environment
  let storage: ContentStorage
  let id: string
  let content: Buffer

  beforeAll(async () => {
    env = new Environment()
    env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, fsu.createTempDirectory())
    storage = await ContentStorageFactory.local(env)

    id = 'some-id'
    content = Buffer.from('123')
  })

  it(`When content is stored, then it can be retrieved`, async () => {
    await storage.storeStream(id, bufferToStream(content))

    const retrievedContent = await storage.retrieve(id)

    expect(await streamToBuffer(await retrievedContent!.asStream())).toEqual(content)
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

    const retrievedContent = await storage.retrieve(id)
    expect(await streamToBuffer(await retrievedContent!.asStream())).toEqual(newContent)
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
})
