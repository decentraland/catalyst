import { EnvironmentConfig } from '@katalyst/content/Environment'
import { EntityByHash } from '@katalyst/content/service/deployments/DeploymentManager'
import { Fetcher } from 'dcl-catalyst-commons'
import fetch from 'node-fetch'
import { deepEqual } from 'ts-mockito'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'
import { buildDeployData } from '../E2ETestUtils'
import { TestServer } from '../TestServer'

describe('Integration - Get Active Entity By Content Hash', () => {
  const testEnv = loadStandaloneTestEnvironment()
  let server: TestServer
  const fetcher = new Fetcher()

  beforeEach(async () => {
    server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
    await server.start()
  })

  it("When the deployment doesn't exist returns 404", async () => {
    const response = await fetch(server.getAddress() + `/contents/fail/active-entity`)

    expect(response.status).toEqual(404)
    expect(response.ok).toBe(false)

    const body = await response.json()
    expect(body.error).toBe('The entity was not found')
  })

  it('When the deployment exists returns the entity id', async () => {
    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: 'this is just some metadata',
      contentPaths: ['content/test/integration/resources/some-binary-file.png']
    })

    const secondDeployResult = await buildDeployData(['0,3', '0,2'], {
      metadata: 'this is just some metadata',
      contentPaths: ['content/test/integration/resources/some-binary-file.png']
    })

    // Deploy entity
    await server.deploy(deployResult.deployData)
    await server.deploy(secondDeployResult.deployData)

    const result = await fetchActiveEntity(deployResult.entity.content?.get('some-binary-file.png') || '')

    expect(result?.entityId).toEqual(deepEqual[(deployResult.entity.id, secondDeployResult.entity.id)])
  })

  async function fetchActiveEntity(contentHash: string): Promise<EntityByHash> {
    const url = server.getAddress() + `/contents/${contentHash}/active-entity`

    return fetcher.fetchJson(url)
  }
})
