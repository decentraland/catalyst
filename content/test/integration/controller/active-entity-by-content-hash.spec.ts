import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'
import { buildDeployData } from '../E2ETestUtils'
import { TestProgram } from '../TestProgram'

loadStandaloneTestEnvironment()('Integration - Get Active Entities By Content Hash', (testEnv) => {
  it("When the deployment doesn't exist returns 404", async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()

    await server.startProgram()

    const response = await fetch(server.getUrl() + `/contents/fail/active-entities`)

    expect(response.status).toEqual(404)
    expect(response.ok).toBe(false)

    const body = await response.json()
    expect(body.error).toBe('The entity was not found')
  })

  it('When the deployment exists returns the entity id', async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()

    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: 'this is just some metadata',
      contentPaths: ['test/integration/resources/some-binary-file.png']
    })

    const secondDeployResult = await buildDeployData(['0,3', '0,2'], {
      metadata: 'this is just some metadata',
      contentPaths: ['test/integration/resources/some-binary-file.png']
    })

    // Deploy entity
    await server.deploy(deployResult.deployData)
    await server.deploy(secondDeployResult.deployData)

    const result = await fetchActiveEntity(
      server,
      deployResult.entity.content?.find(({ file }) => file === 'some-binary-file.png')?.hash ?? ''
    )

    expect(result).toEqual([deployResult.entity.id, secondDeployResult.entity.id])
  })

  async function fetchActiveEntity(server: TestProgram, contentHash: string): Promise<string[]> {
    const url = server.getUrl() + `/contents/${contentHash}/active-entities`

    return (await fetch(url)).json()
  }
})
