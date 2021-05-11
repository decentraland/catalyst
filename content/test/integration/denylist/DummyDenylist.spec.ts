import { Bean, EnvironmentConfig } from '@katalyst/content/Environment'
import { assertPromiseIsRejected } from '@katalyst/test-helpers/PromiseAssertions'
import { MockedContentCluster } from '@katalyst/test-helpers/service/synchronization/MockedContentCluster'
import { MockedSynchronizationManager } from '@katalyst/test-helpers/service/synchronization/MockedSynchronizationManager'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'
import { buildDeployData, createIdentity } from '../E2ETestUtils'
import { TestServer } from '../TestServer'

describe('Integration - DummyDenylist', () => {
  const metadata: string = 'Some metadata'
  const decentralandIdentity = createIdentity()
  const ownerIdentity = createIdentity()
  const testEnv = loadStandaloneTestEnvironment()
  let server: TestServer

  beforeEach(async () => {
    server = await testEnv
      .configServer()
      .withBean(Bean.SYNCHRONIZATION_MANAGER, new MockedSynchronizationManager())
      .withBean(Bean.CONTENT_CLUSTER, MockedContentCluster.withAddress(ownerIdentity.address))
      .withConfig(EnvironmentConfig.DECENTRALAND_ADDRESS, decentralandIdentity.address)
      .withConfig(EnvironmentConfig.DISABLE_DENYLIST, true)
      .andBuild()

    await server.start()
  })

  it(`When an entity is denylisted, then an error is thrown`, async () => {
    // Prepare entity to deploy
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'], {
      metadata,
      contentPaths: ['content/test/integration/resources/some-binary-file.png']
    })

    // Deploy the entity
    await server.deploy(deployData)

    // Denylist the entity
    await assertPromiseIsRejected(() => server.denylistEntity(entityBeingDeployed, decentralandIdentity))
  })

  it(`When an entity is undenylisted, then it fails`, async () => {
    // Prepare entity to deploy
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'], {
      metadata,
      contentPaths: ['content/test/integration/resources/some-binary-file.png']
    })

    // Deploy the entity
    await server.deploy(deployData)

    // Undenylist the entity
    await assertPromiseIsRejected(() => server.undenylistEntity(entityBeingDeployed, decentralandIdentity))
  })

  it(`When getting denylistedTargets, then it is empty`, async () => {
    // Prepare entity to deploy
    const { deployData } = await buildDeployData(['0,0', '0,1'], {
      metadata,
      contentPaths: ['content/test/integration/resources/some-binary-file.png']
    })

    // Deploy the entity
    await server.deploy(deployData)

    expect(await server.getDenylistTargets()).toEqual([])
  })
})
