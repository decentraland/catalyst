import fetch from 'node-fetch'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { createDefaultServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'

describe('Integration - Get Content', () => {
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
