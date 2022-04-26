import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'

loadStandaloneTestEnvironment()('Integration - Entities', (testEnv) => {
  it('returns 500 when there is an exception while deploying the entity', async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
    jest.spyOn(server.components.deployer, 'deployEntity').mockRejectedValue({error: 'error'})

    makeNoopValidator(server.components)

    await server.startProgram()

    const url = server.getUrl() + `/entities`
    const res = await fetch(url, {method: 'POST'})

    expect(res.status).toBe(500)
  })
})
