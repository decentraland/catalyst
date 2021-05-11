import { Bean, EnvironmentConfig } from '@katalyst/content/Environment'
import { assertPromiseIsRejected } from '@katalyst/test-helpers/PromiseAssertions'
import { MockedContentCluster } from '@katalyst/test-helpers/service/synchronization/MockedContentCluster'
import { MockedSynchronizationManager } from '@katalyst/test-helpers/service/synchronization/MockedSynchronizationManager'
import { assertEntityIsNotDenylisted, assertFileIsOnServer } from '../E2EAssertions'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'
import { buildDeployData, createIdentity } from '../E2ETestUtils'
import { TestServer } from '../TestServer'

fdescribe('Integration - DummyDenylist', () => {
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

  it(`When an entity is denylisted, then the metadata and content are shown`, async () => {
    // Prepare entity to deploy
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'], {
      metadata,
      contentPaths: ['content/test/integration/resources/some-binary-file.png']
    })

    // Deploy the entity
    await server.deploy(deployData)

    // Assert that the entity is not sanitized
    const entityOnServer = await server.getEntityById(entityBeingDeployed.type, entityBeingDeployed.id)
    expect(entityOnServer).toEqual(entityBeingDeployed)

    // Assert that entity file is available
    await assertFileIsOnServer(server, entityBeingDeployed.id)

    // Assert that audit info doesn't say that it is denylisted
    await assertEntityIsNotDenylisted(server, entityBeingDeployed)

    // Denylist the entity
    await assertPromiseIsRejected(() => server.denylistEntity(entityBeingDeployed, decentralandIdentity))
  })

  it(`When an entity is undenylisted, then it fails`, async () => {
    // Prepare entity to deploy
    const { controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'], {
      metadata,
      contentPaths: ['content/test/integration/resources/some-binary-file.png']
    })

    // Undenylist the entity
    await assertPromiseIsRejected(() => server.undenylistEntity(entityBeingDeployed, decentralandIdentity))
  })

  it(`When random identity tries to denylist an entity, then an error is thrown`, async () => {
    // Prepare entity to deploy
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'], { metadata })

    // Deploy the entity
    await server.deploy(deployData)

    // Denylist the entity
    await assertPromiseIsRejected(() => server.denylistEntity(entityBeingDeployed, createIdentity()))
  })
})
