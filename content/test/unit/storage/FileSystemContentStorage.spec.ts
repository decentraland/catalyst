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
    jest.useFakeTimers()
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

  it(`When file is open and saved, it is saved in correct directory`, async () => {
    const openContentItem = fss.create(id)
    await openContentItem.save()
    expect(fs.existsSync(filePath)).toBeTruthy()
  })

  it(`When buffer is appended to open file and saved, the buffer is written`, async () => {
    const openContentItem = fss.create(id)
    const contentToAppend = 'Welcome to Decentraland!'
    await openContentItem.append(contentToAppend)
    await openContentItem.save()
    expect(fs.existsSync(filePath)).toBeTruthy()
    const fileContent = fs.readFileSync(filePath).toString()
    expect(fileContent).toBe(contentToAppend)
  })

  it(`When file is open, not saved and open a new one with same id, then it is saved only with the buffer of the second open`, async () => {
    const unsavedContentItem1 = fss.create(id)
    unsavedContentItem1.append('Not saved content')
    const unsavedContentItem2 = fss.create(id)
    const contentToBeSaved = 'Content to be saved'
    await unsavedContentItem2.append(contentToBeSaved)
    await unsavedContentItem2.save()
    expect(fs.existsSync(filePath)).toBeTruthy()
    const fileContent = fs.readFileSync(filePath).toString()
    expect(fileContent).toBe(contentToBeSaved)
  })

  it(`When file is open but not saved, it is not instantly saved in the content directory`, async () => {
    const unsavedContentItem = fss.create(id)
    await unsavedContentItem.append('Save me pleeease!')
    expect(fs.existsSync(filePath)).toBeFalsy()
  })

  it(`When unsaved file is aborted, it is not saved and then temp file is removed`, async () => {
    const unsavedContentItem = fss.create(id)
    await unsavedContentItem.append('Content to be aborted')
    await unsavedContentItem.abort()
    expect(await fss.exist([id])[0]).toBeFalsy()
    const files = fs.readdirSync(testTmpDir + '/__tmp')
    expect(files.length).toBe(0)
  })

  it(`When unsaved file is aborted, it can not be written`, async () => {
    const unsavedContentItem = fss.create(id)
    await unsavedContentItem.append('Content to be aborted')
    await unsavedContentItem.abort()
    expect(async () => {
      await unsavedContentItem.append('content')
    }).rejects.toThrowError('Can not append to a file that was aborted or saved.')
  })

  it(`When file is saved, it can not be written`, async () => {
    const unsavedContentItem = fss.create(id)
    await unsavedContentItem.append('Content to be written')
    await unsavedContentItem.save()
    expect(async () => {
      await unsavedContentItem.append('content not to be written')
    }).rejects.toThrowError('Can not append to a file that was aborted or saved.')
  })

  it(`When unsaved file is not edited for 5 min, it is aborted and can not be saved`, async () => {
    jest.useFakeTimers()
    const unsavedContentItem = fss.create(id)
    await unsavedContentItem.append('Content to be aborted')

    const now = new Date()
    const tenMinutesInFuture = new Date(now)
    tenMinutesInFuture.setMinutes(now.getMinutes() + 10)
    jest.setSystemTime(tenMinutesInFuture)
    jest.advanceTimersByTime(1000 * 60 * 10)

    expect(fss.exist([id])[0]).toBeFalsy()
    expect(await unsavedContentItem.save()).toBeFalsy()
    // const files = fs.readdirSync(testTmpDir + '/__tmp')
    // console.log(files)
    // expect(files.length).toBe(0)
    // jest.runOnlyPendingTimers()
  })

  afterAll(async () => {
    fs.rmSync(testSuiteTmpDir, {recursive: true, force: true})
  })
})
