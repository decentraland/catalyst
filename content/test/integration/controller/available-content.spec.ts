import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { setupTestEnvironment } from '../E2ETestEnvironment'

describe('Integration - Available Content', () => {
  const getTestEnv = setupTestEnvironment()

  it('returns 400 when no cid is provided', async () => {
    const server = await getTestEnv()
      .configServer()
      .withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true)
      .andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()

    const url = server.getUrl() + `/available-content`
    const res = await fetch(url)

    expect(res.status).toBe(400)
  })
})
