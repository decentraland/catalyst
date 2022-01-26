import fs from 'fs'
import os from 'os'
import path from 'path'
import { FileSystemContentStorage } from '../../../src/storage/FileSystemContentStorage'

describe('FileSystemContentStorage', () => {
  let testSuiteTmpDir: string
  let fss: FileSystemContentStorage
  let id: string
  let subDirectory: string
  let content: Buffer
  let filePath: string
  let testTmpDir: string

  beforeAll(() => {
    // jest.useFakeTimers()
    testSuiteTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testSuite-'))
    content = Buffer.from('123')
    id = 'some-id'
    // The subdirectory within /contents must be the first 4 digits of the SHA256 of the id
    // sha1(id) = 9584b661c135a43f2fbbe43cc5104f7bd693d048
    subDirectory = '9584'
  })

  beforeEach(async () => {
    testTmpDir = fs.mkdtempSync(path.join(testSuiteTmpDir, 'test-'))
    filePath = path.join(testTmpDir, subDirectory, id)
    fss = await FileSystemContentStorage.build(testTmpDir)
  })

  it(`When content is stored, then the correct file structure is created`, async () => {
    await fss.store(id, content)
    expect(fs.existsSync(filePath)).toBeTruthy()
  })

  it(`When content is deleted, then the backing file is also deleted`, async () => {
    await fss.store(id, content)
    expect(fs.existsSync(filePath)).toBeTruthy()

    await fss.delete([id])
    expect(fs.existsSync(filePath)).toBeFalsy()
  })

  it(`When root dir is unexistent, then it creates the dir and the content storage`, async () => {
    const unexistentRootDir = path.join(testSuiteTmpDir, 'unexistentDir')
    expect(fs.existsSync(unexistentRootDir)).toBeFalsy()
    fss = await FileSystemContentStorage.build(unexistentRootDir)
    expect(fs.existsSync(unexistentRootDir)).toBeTruthy()
  })

  it(`When content is store with encoding, then the backing file is saved with .gzip extension`, async () => {
    await fss.store(id, content, 'gzip')
    expect(fs.existsSync(filePath + '.gzip')).toBeTruthy()
  })

  afterAll(async () => {
    fs.rmSync(testSuiteTmpDir, {recursive: true, force: true})
  })
})
