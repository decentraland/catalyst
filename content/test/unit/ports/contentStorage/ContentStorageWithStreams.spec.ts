import path from 'path'
import { Environment, EnvironmentConfig } from '../../../../src/Environment'
import { bufferToStream, ContentStorage, streamToBuffer } from '../../../../src/ports/contentStorage/contentStorage'
import { createFileSystemContentStorage } from '../../../../src/ports/contentStorage/fileSystemContentStorage'
import { createFsComponent } from '../../../../src/ports/fs'
import { FileSystemUtils as fsu } from './FileSystemUtils'

describe('ContentStorage', () => {
  let env: Environment
  let storage: ContentStorage
  let id: string
  let content: Buffer

  beforeAll(async () => {
    env = new Environment()
    env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, fsu.createTempDirectory())
    const contentFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
    storage = await createFileSystemContentStorage({ fs: createFsComponent() }, contentFolder)

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

    expect(await storage.exist(id)).toBe(true)

    await storage.delete([id])

    expect(await storage.exist(id)).toBe(false)
  })

  it(`When content is stored on compressed, then the asStream returns with unzipped content`, async function () {
    // make sure the files we are going to use are not present in the file system
    await storage.delete([id])

    expect(await storage.retrieve(id)).toBeUndefined()

    // only big files with a good ratio of compression are stored compressed
    const newContent = Buffer.from(new Uint8Array(10000).fill(0))

    await storage.storeStreamAndCompress(id, bufferToStream(newContent))

    const retrievedContent = await storage.retrieve(id)

    expect({ encoding: retrievedContent?.encoding, size: retrievedContent?.size }).toEqual({ encoding: 'gzip', size: 45 })
    expect(await streamToBuffer(await retrievedContent!.asStream())).toEqual(newContent)
  })
})
