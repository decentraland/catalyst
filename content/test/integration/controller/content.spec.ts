import fetch from 'node-fetch'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { SimpleTestEnvironment, createSimpleTestEnvironment } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'
import LeakDetector from 'jest-leak-detector'

describe('Integration - Get Content', () => {
  let server: TestProgram
  let env: SimpleTestEnvironment

  beforeAll(async () => {
    env = await createSimpleTestEnvironment()
    server = await env.start()
    makeNoopValidator(server.components)
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(env)
    await env.stop()
    env = null as any
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
