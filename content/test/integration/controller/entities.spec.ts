import fetch from 'node-fetch'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { createDefaultServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'
import LeakDetector from 'jest-leak-detector'

describe('Integration - Entities', () => {
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

  it('returns 500 when there is an exception while deploying the entity', async () => {
    jest.spyOn(server.components.deployer, 'deployEntity').mockRejectedValue({ error: 'error' })

    const url = server.getUrl() + `/entities`
    const res = await fetch(url, { method: 'POST' })

    expect(res.status).toBe(500)
  })
})
