import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { setupTestEnvironment } from '../E2ETestEnvironment'

describe('Integration - Entities', () => {
  const getTestEnv = setupTestEnvironment()

  it('returns 500 when there is an exception while deploying the entity', async () => {
    const server = await getTestEnv()
      .configServer()
      .withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true)
      .andBuild()
    jest.spyOn(server.components.deployer, 'deployEntity').mockRejectedValue({ error: 'error' })

    makeNoopValidator(server.components)

    await server.startProgram()

    const url = server.getUrl() + `/entities`
    const res = await fetch(url, { method: 'POST' })

    expect(res.status).toBe(500)
  })
})
