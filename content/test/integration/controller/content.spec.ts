import fetch from 'node-fetch'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { createDefaultServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'
import LeakDetector from 'jest-leak-detector'

describe('Integration - Get Content', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
    makeNoopValidator(server.components)
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

  it('returns 404 when the content file does not exist', async () => {
    const url = server.getUrl() + `/contents/non-existent-file`
    const res = await fetch(url)

    expect(res.status).toBe(404)
  })

  it('returns 404 when the content file does not exist for the head method', async () => {
    const url = server.getUrl() + `/contents/non-existent-file`
    const res = await fetch(url, { method: 'HEAD' })

    expect(res.status).toBe(404)
  })
})
