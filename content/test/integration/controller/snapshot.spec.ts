import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { setupTestEnvironment } from '../E2ETestEnvironment'

describe('Integration - Snapshot', () => {
  const getTestEnv = setupTestEnvironment()

  it('returns 503 when the snapshot has no metadata', async () => {
    const server = await getTestEnv()
      .configServer()
      .withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true)
      .andBuild()
    jest.spyOn(server.components.snapshotManager, 'getFullSnapshotMetadata').mockReturnValue(undefined)

    makeNoopValidator(server.components)

    await server.startProgram()

    const url = server.getUrl() + `/snapshot`
    const res = await fetch(url)

    expect(res.status).toBe(503)
  })
})
