import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { setupTestEnvironment } from '../E2ETestEnvironment'

describe('Integration - Get Content', () => {
  const getTestEnv = setupTestEnvironment()

  it('returns 404 when the content file does not exist', async () => {
    const server = await getTestEnv()
      .configServer()
      .withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true)
      .andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()

    const url = server.getUrl() + `/contents/non-existent-file`
    const res = await fetch(url)

    expect(res.status).toBe(404)
  })

  it('returns 404 when the content file does not exist for the head method', async () => {
    const server = await getTestEnv()
      .configServer()
      .withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true)
      .andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()

    const url = server.getUrl() + `/contents/non-existent-file`
    const res = await fetch(url, { method: 'HEAD' })

    expect(res.status).toBe(404)
  })
})
