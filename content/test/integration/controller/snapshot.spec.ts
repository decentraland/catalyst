import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'

loadStandaloneTestEnvironment()('Integration - Snapshot', (testEnv) => {
  it('returns 503 when the snapshot has no metadata', async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
    jest.spyOn(server.components.snapshotManager, 'getFullSnapshotMetadata').mockReturnValue(undefined)

    makeNoopValidator(server.components)

    await server.startProgram()

    const url = server.getUrl() + `/snapshot`
    const res = await fetch(url)

    let text = (await res.buffer()).toString()

    expect(res.status).toBe(503)
  })
})
