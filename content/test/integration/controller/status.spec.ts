import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'

loadStandaloneTestEnvironment()('Integration - Status', (testEnv) => {
  it('returns 200 when the status is ok', async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()

    const url = server.getUrl() + `/status`
    const res = await fetch(url)

    let text = (await res.buffer()).toString()

    expect(res.status).toBe(200)
  })
})
