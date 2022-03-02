import fs from 'fs'
import fetch from 'node-fetch'
import path from 'path'
import { Controller } from '../../../src/controller/Controller'
import { EnvironmentConfig } from '../../../src/Environment'
import { bufferToStream } from '../../../src/ports/contentStorage/contentStorage'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'

loadStandaloneTestEnvironment()('Integration - Get Content', (testEnv) => {
  it('calls the headContent controller when the head endpoint is requested', async () => {
    const testFilePath = path.resolve(__dirname, '../', 'resources', 'some-text-file.txt')
    const content = await fs.promises.readFile(testFilePath)
    const id = 'some-id'

    const headContentSpy = jest.spyOn(Controller.prototype, 'headContent')
    const getContentSpy = jest.spyOn(Controller.prototype, 'getContent')

    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
    await server.components.storage.storeStream(id, bufferToStream(content))

    makeNoopValidator(server.components)

    await server.startProgram()

    const url = server.getUrl() + `/contents/${id}`
    const res = await fetch(url, { method: 'HEAD' })

    let text = (await res.buffer()).toString()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-length')).toBe(content.length.toString())

    expect(headContentSpy).toHaveBeenCalledTimes(1)
    expect(getContentSpy).toHaveBeenCalledTimes(0)
  })

  it('returns the full content', async () => {
    const testFilePath = path.resolve(__dirname, '../', 'resources', 'some-text-file.txt')
    const content = await fs.promises.readFile(testFilePath)
    const id = 'some-id'

    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
    await server.components.storage.storeStream(id, bufferToStream(content))

    makeNoopValidator(server.components)

    await server.startProgram()

    const url = server.getUrl() + `/contents/${id}`
    const res = await fetch(url)

    let text = (await res.buffer()).toString()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-length')).toBe(content.length.toString())
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(text).toBe(content.toString())
  })

  it('returns partial content when a range is provided', async () => {
    const testFilePath = path.resolve(__dirname, '../', 'resources', 'some-text-file.txt')
    const content = await fs.promises.readFile(testFilePath)
    const contextString = content.toString()
    const id = 'some-id'

    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
    await server.components.storage.storeStream(id, bufferToStream(content))

    makeNoopValidator(server.components)

    await server.startProgram()

    const url = server.getUrl() + `/contents/${id}`
    const res = await fetch(url, {
      headers: {
        range: 'bytes=0-10'
      }
    })

    let text = (await res.buffer()).toString()

    expect(res.status).toBe(206)
    expect(res.headers.get('content-length')).toBe('11')
    expect(res.headers.get('content-range')).toBe(`bytes 0-10/${contextString.length}`)
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(text).toBe(contextString.slice(0, 11))
  })
})