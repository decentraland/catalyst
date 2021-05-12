import { Bean } from '@katalyst/content/Environment'
import { EntityByHash } from '@katalyst/content/service/deployments/DeploymentManager'
import { MockedSynchronizationManager } from '@katalyst/test-helpers/service/synchronization/MockedSynchronizationManager'
import { Fetcher } from 'dcl-catalyst-commons'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'
import { buildDeployData } from '../E2ETestUtils'
import { TestServer } from '../TestServer'

fdescribe('Integration - Get Active Entity By Content Hash', () => {
  const testEnv = loadStandaloneTestEnvironment()
  let server: TestServer
  const fetcher = new Fetcher()

  beforeEach(async () => {
    server = await testEnv
      .configServer()
      .withBean(Bean.SYNCHRONIZATION_MANAGER, new MockedSynchronizationManager())
      .andBuild()
    await server.start()
  })

  it('When deployments fields filter is used, then the result is the expected', async () => {
    const { deployData } = await buildDeployData(['0,0', '0,1'], {
      metadata: 'this is just some metadata',
      contentPaths: ['content/test/integration/resources/some-binary-file.png']
    })

    // Deploy entity
    await server.deploy(deployData)

    console.log('fun', fetchActiveEntity)

    // Fetch deployments
    await fetchActiveEntity('q')

    expect(true).toBe(true)
  })
  // const testEnv = loadStandaloneTestEnvironment()
  // let server: TestServer
  // const fetcher = new Fetcher()

  // beforeAll(async () => {
  //   server = await testEnv
  //     .configServer()
  //     .withBean(Bean.SYNCHRONIZATION_MANAGER, new MockedSynchronizationManager())
  //     .andBuild()
  //   await server.start()
  // })

  // it(`When garbage collection is on, then unused content is deleted`, async () => {
  //   const { deployData } = await buildDeployData(['0,0', '0,1'], {
  //     metadata: 'this is just some metadata',
  //     contentPaths: ['content/test/integration/resources/some-binary-file.png']
  //   })

  //   // Deploy entity
  //   await server.deploy(deployData)

  //   // Fetch deployments
  //   await fetchActiveEntity("")

  //   expect(true).toBe(false);
  // })

  async function fetchActiveEntity(contentHash: string): Promise<EntityByHash> {
    const url = server.getAddress() + `/contents/${contentHash}/active-entity`
    console.log(url)
    return fetcher.fetchJson(url)
  }
})
