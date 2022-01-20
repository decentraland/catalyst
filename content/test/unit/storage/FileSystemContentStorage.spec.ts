import fs from 'fs'
import os from 'os'
import path from 'path'
import { FileSystemContentStorage } from '../../../src/storage/FileSystemContentStorage'

describe('FileSystemContentStorage', () => {
  let tmpRootDir: string
  let fss: FileSystemContentStorage
  let id: string
  let content: Buffer
  let subDirectory: string
  let filePath: string

  beforeAll(() => {
    tmpRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foo-'))
    id = 'some-id'
    content = Buffer.from('123')
    // The subdirectory within /contents must be the first 4 digits of the SHA256 of the id
    // sha1(id) = 9584b661c135a43f2fbbe43cc5104f7bd693d048
    subDirectory = '9584'
    filePath = [tmpRootDir, subDirectory, id].join('/')
  })

  beforeEach(async () => {
    fs.rmSync(tmpRootDir + '/' + subDirectory, {recursive: true, force: true})
    fss = await FileSystemContentStorage.build(tmpRootDir)
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
    const unexistentRootDir = tmpRootDir + '/' + 'unexistentDir'
    expect(fs.existsSync(unexistentRootDir)).toBeFalsy()
    fss = await FileSystemContentStorage.build(unexistentRootDir)
    expect(fs.existsSync(unexistentRootDir)).toBeTruthy()
  })

  it(`When file is opened but not saved, it is not saved in content directory`, async () => {
    const unsavedContentItem = fss.create(id)
    unsavedContentItem.append('Save me pleeease!')
    expect(fs.existsSync(filePath)).toBeFalsy()
    // expect(fs.existsSync(tmpFilePath)).toBeFalsy()
  })

  it(`When file is opened and saved, it is saved in correct directory`, async () => {
    const openedContentItem = fss.create(id)
    await openedContentItem.save()
    expect(fs.existsSync(filePath)).toBeTruthy()
  })

  it(`When buffer is appended to opened file and saved, the buffer is written`, async () => {
    const openedContentItem = fss.create(id)
    const contentToAppend = 'Welcome to Decentraland!'
    await openedContentItem.append(contentToAppend)
    await openedContentItem.save()
    expect(fs.existsSync(filePath)).toBeTruthy()
    const fileContent = fs.readFileSync(filePath).toString()
    expect(fileContent).toBe(contentToAppend)
  })

  it(`When file is open, not saved and re-open, then it is created only with the buffer of the second open`, async () => {
    const unsavedContentItem1 = fss.create(id)
    unsavedContentItem1.append('Not saved content')
    const unsavedContentItem2 = fss.create(id)
    console.log(unsavedContentItem2)
    const contentToBeSaved = 'Content to be saved'
    await unsavedContentItem2.append(contentToBeSaved)
    await unsavedContentItem2.save()
    expect(fs.existsSync(filePath)).toBeTruthy()
    const fileContent = fs.readFileSync(tmpRootDir + '/' + subDirectory + '/' + id).toString()
    expect(fileContent).toBe(contentToBeSaved)
  })

  afterAll(async () => {
    fs.rmSync(tmpRootDir, {recursive: true, force: true})
  })
})
