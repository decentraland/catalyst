import fs from 'fs'
import fetch from 'node-fetch'
import path from 'path'
import { Controller } from '../../../src/controller/Controller'
import { EnvironmentConfig } from '../../../src/Environment'
import { FileSystemContentStorage } from '../../../src/ports/contentStorage/fileSystemContentStorage'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'

loadStandaloneTestEnvironment()('Integration - Get Content', (testEnv) => {
  let testFileText: string
  let getFilePathSpy: jest.SpyInstance

  beforeAll(async () => {
    const testFilePath = path.resolve(__dirname, '../', 'resources', 'some-text-file.txt')
    testFileText = (await fs.promises.readFile(testFilePath)).toString()

    getFilePathSpy = jest.spyOn(FileSystemContentStorage.prototype as any, 'getFilePath')
    getFilePathSpy.mockReturnValue(testFilePath)
  })

  afterAll(() => {
    getFilePathSpy.mockRestore()
  })

  it('calls the headContent controller when the head endpoint is requested', async () => {
    const headContentSpy = jest.spyOn(Controller.prototype, 'headContent')
    const getContentSpy = jest.spyOn(Controller.prototype, 'getContent')

    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()

    const url = server.getUrl() + `/contents/QmNn5Zs21mZeYitXTQyjVyVaThvzjKUVFgvBjXxJPAevdU`
    const res = await fetch(url, { method: 'HEAD' })

    let text = (await res.buffer()).toString()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-length')).toBe(testFileText.length.toString())

    expect(headContentSpy).toHaveBeenCalledTimes(1)
    expect(getContentSpy).toHaveBeenCalledTimes(0)
  })
})
