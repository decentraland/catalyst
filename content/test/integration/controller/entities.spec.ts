import fetch from 'node-fetch'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { createDefaultServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'

describe('Integration - Entities', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
    makeNoopValidator(server.components)
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    await server.stopProgram()
    server = null as any
  })

  it('returns 500 when there is an exception while deploying the entity', async () => {
    jest.spyOn(server.components.deployer, 'deployEntity').mockRejectedValue({ error: 'error' })

    const url = server.getUrl() + `/entities`
    const res = await fetch(url, { method: 'POST' })

    expect(res.status).toBe(500)
  })
})
