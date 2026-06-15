import { makeNoopValidator } from '../../helpers/logic/server-validator/NoOpValidator'
import { createDefaultServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'
import LeakDetector from 'jest-leak-detector'

describe('Integration - Available Content', () => {
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

  it('returns 400 when no cid is provided', async () => {
    const url = server.getUrl() + `/available-content`
    const res = await fetch(url)

    expect(res.status).toBe(400)
  })

  it('returns 400 when more cids than the allowed maximum are provided', async () => {
    const cids = Array.from({ length: 1001 }, (_, i) => `cid=Qm${i}`).join('&')
    const url = server.getUrl() + `/available-content?${cids}`
    const res = await fetch(url)

    expect(res.status).toBe(400)
  })
})
