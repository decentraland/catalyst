import fetch from 'node-fetch'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { SimpleTestEnvironment, createSimpleTestEnvironment } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'
import LeakDetector from 'jest-leak-detector'

describe('Integration - Available Content', () => {
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

  it('returns 400 when no cid is provided', async () => {
    const url = server.getUrl() + `/available-content`
    const res = await fetch(url)

    expect(res.status).toBe(400)
  })
})
