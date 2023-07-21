import fetch from 'node-fetch'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { createDefaultServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'
import LeakDetector from 'jest-leak-detector'

describe('Integration - Status', () => {
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

  it('returns 200 when the status is ok', async () => {
    const url = server.getUrl() + `/status`
    const res = await fetch(url)

    expect(res.status).toBe(200)
  })
})
