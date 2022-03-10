import path from 'path'
import { bufferToStream, ContentStorage } from '../../../../src/ports/contentStorage/contentStorage'
import { createFileSystemContentStorage } from '../../../../src/ports/contentStorage/fileSystemContentStorage'
import { createFsComponent } from '../../../../src/ports/fs'
import { FileSystemUtils as fsu } from '../../ports/contentStorage/FileSystemUtils'

describe('fileSystemContentStorage', () => {
  let tmpRootDir: string
  let fss: ContentStorage
  let id: string
  let content: Buffer
  let filePath: string
  let id2: string
  let content2: Buffer
  let filePath2: string

  beforeAll(async () => {
    tmpRootDir = fsu.createTempDirectory()
    fss = await createFileSystemContentStorage({ fs: createFsComponent() }, tmpRootDir)

    // sha1('some-id') = 9584b661c135a43f2fbbe43cc5104f7bd693d048
    id = 'some-id'
    filePath = path.join(tmpRootDir, '9584', id)
    content = Buffer.from('123')

    // sha1('another-id') = ea6cf57af4e7e1a5041298624af4bff04d245e71
    id2 = 'another-id'
    filePath2 = path.join(tmpRootDir, 'ea6c', id2)
    content2 = Buffer.from('456')
  })

  it(`When content is stored, then the correct file structure is created`, async () => {
    await fss.storeStream(id, bufferToStream(content))
    expect(fsu.fileExists(filePath)).toBeTruthy()
  })

  it(`When content is deleted, then the backing file is also deleted`, async () => {
    await fss.storeStream(id, bufferToStream(content))
    expect(fsu.fileExists(filePath)).toBeTruthy()
    await fss.delete([id])
    expect(fsu.fileExists(filePath)).toBeFalsy()
  })

  it(`When multiple content is stored, then the correct file structure is created`, async () => {
    await fss.storeStream(id, bufferToStream(content))
    await fss.storeStream(id2, bufferToStream(content2))
    expect(fsu.fileExists(filePath)).toBeTruthy()
    expect(fsu.fileExists(filePath2)).toBeTruthy()
  })

  it(`When multiple content is stored and one is deleted, then the correct file is deleted`, async () => {
    await fss.storeStream(id, bufferToStream(content))
    await fss.storeStream(id2, bufferToStream(content2))
    await fss.delete([id2])
    expect(fsu.fileExists(filePath)).toBeTruthy()
    expect(fsu.fileExists(filePath2)).toBeFalsy()
  })

  it(`When a content with bad compression ratio is stored and compressed, then it is not stored as .gzip`, async () => {
    await fss.storeStreamAndCompress(id, bufferToStream(content))
    expect(fsu.fileExists(filePath)).toBeTruthy()
    expect(fsu.fileExists(filePath + '.gzip')).toBeFalsy()
  })

  it(`When a content with good compression ratio is stored and compressed, then it is stored as .gzip and non-compressed file is deleted`, async () => {
    const goodCompresstionRatioContent = Buffer.from(new Uint8Array(100).fill(0))
    await fss.storeStreamAndCompress(id, bufferToStream(goodCompresstionRatioContent))
    expect(fsu.fileExists(filePath)).toBeFalsy()
    expect(fsu.fileExists(filePath + '.gzip')).toBeTruthy()
  })
})
