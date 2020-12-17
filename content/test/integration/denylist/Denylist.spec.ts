import { ControllerDenylistData } from '@katalyst/content/controller/Controller'
import { DenylistServiceDecorator } from '@katalyst/content/denylist/DenylistServiceDecorator'
import { buildEntityTarget, DenylistTargetType } from '@katalyst/content/denylist/DenylistTarget'
import { Bean, EnvironmentConfig } from '@katalyst/content/Environment'
import { assertPromiseIsRejected } from '@katalyst/test-helpers/PromiseAssertions'
import { MockedContentCluster } from '@katalyst/test-helpers/service/synchronization/MockedContentCluster'
import { MockedSynchronizationManager } from '@katalyst/test-helpers/service/synchronization/MockedSynchronizationManager'
import { Entity as ControllerEntity } from 'dcl-catalyst-commons'
import {
  assertContentIsDenylisted,
  assertContentNotIsDenylisted,
  assertEntityIsDenylisted,
  assertEntityIsNotDenylisted,
  assertFileIsNotOnServer,
  assertFileIsOnServer,
  assertRequiredFieldsOnEntitiesAreEqual
} from '../E2EAssertions'
import { loadTestEnvironment } from '../E2ETestEnvironment'
import { buildDeployData, createIdentity } from '../E2ETestUtils'
import { TestServer } from '../TestServer'

describe('Integration - Denylist', () => {
  const metadata: string = 'Some metadata'
  const decentralandIdentity = createIdentity()
  const ownerIdentity = createIdentity()
  const testEnv = loadTestEnvironment()
  let server: TestServer

  beforeEach(async () => {
    server = await testEnv
      .configServer()
      .withBean(Bean.SYNCHRONIZATION_MANAGER, new MockedSynchronizationManager())
      .withBean(Bean.CONTENT_CLUSTER, MockedContentCluster.withAddress(ownerIdentity.address))
      .withConfig(EnvironmentConfig.DECENTRALAND_ADDRESS, decentralandIdentity.address)
      .andBuild()

    await server.start()
  })

  it(`When an entity is denylisted, then the metadata and content are hidden`, async () => {
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
    await server.denylistEntity(entityBeingDeployed, decentralandIdentity)

    // Assert that entity has been sanitized
    const denylistedEntity = await server.getEntityById(entityBeingDeployed.type, entityBeingDeployed.id)
    assertRequiredFieldsOnEntitiesAreEqual(denylistedEntity, entityBeingDeployed)
    expect(denylistedEntity.metadata).toBe(DenylistServiceDecorator.DENYLISTED_METADATA)
    expect(denylistedEntity.content).toBeUndefined()

    // Assert that entity file is not available
    await assertFileIsNotOnServer(server, entityBeingDeployed.id)

    // Assert that audit info marks the entity as denylisted
    await assertEntityIsDenylisted(server, entityBeingDeployed)
  })

  it(`When an entity is undenylisted, then it goes back to normal`, async () => {
    // Prepare entity to deploy
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'], {
      metadata,
      contentPaths: ['content/test/integration/resources/some-binary-file.png']
    })

    // Deploy the entity
    await server.deploy(deployData)

    // Denylist the entity
    await server.denylistEntity(entityBeingDeployed, decentralandIdentity)

    // Assert that entity file is not available
    await assertEntityIsDenylisted(server, entityBeingDeployed)

    // Undenylist the entity
    await server.undenylistEntity(entityBeingDeployed, decentralandIdentity)

    // Assert that audit info marks the entity as denylisted
    await assertEntityIsNotDenylisted(server, entityBeingDeployed)

    // Assert that the entity is not sanitized
    const entityOnServer = await server.getEntityById(entityBeingDeployed.type, entityBeingDeployed.id)
    expect(entityOnServer).toEqual(entityBeingDeployed)
  })

  it(`When content is denylisted, then the entity that contains it says so`, async () => {
    // Prepare entity to deploy
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'], {
      metadata,
      contentPaths: ['content/test/integration/resources/some-binary-file.png']
    })
    const contentHash = entityBeingDeployed.content![0].hash

    // Deploy the entity
    await server.deploy(deployData)

    // Assert that the content file is available
    await assertFileIsOnServer(server, contentHash)

    // Assert that the audit info doesn't mark content as denylisted
    await assertContentNotIsDenylisted(server, entityBeingDeployed, contentHash)

    // Denylist the content
    await server.denylistContent(contentHash, decentralandIdentity)

    // Assert that the content file is not available
    await assertFileIsNotOnServer(server, contentHash)

    // Assert that audit info marks content entity as denylisted
    await assertContentIsDenylisted(server, entityBeingDeployed, contentHash)
  })

  it(`When an entity is denylisted, then it is reported as target`, async () => {
    // Prepare entity to deploy
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'], { metadata })

    // Deploy the entity
    await server.deploy(deployData)

    // Make sure that no target is currently reported
    const targetsBeforeBlacklist: ControllerDenylistData[] = await server.getDenylistTargets()
    expect(targetsBeforeBlacklist.length).toBe(0)

    // Denylist the entity
    await server.denylistEntity(entityBeingDeployed, decentralandIdentity)

    // Assert that the entity is now reported as target
    const targetsAfterBlacklist = await server.getDenylistTargets()
    expect(targetsAfterBlacklist.length).toBe(1)

    const [{ target }] = targetsAfterBlacklist
    expect(target.type).toBe(DenylistTargetType.ENTITY)
    expect(target.id).toBe(getTargetIdFromEntity(entityBeingDeployed))
  })

  it(`When an entity is undenylisted, then it is no longer reported as target`, async () => {
    // Prepare entity to deploy
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'], { metadata })

    // Deploy the entity
    await server.deploy(deployData)

    // Denylist the entity
    await server.denylistEntity(entityBeingDeployed, decentralandIdentity)

    // Make sure that the target is reported
    const targetsBeforeUndenylist: ControllerDenylistData[] = await server.getDenylistTargets()
    expect(targetsBeforeUndenylist.length).toBe(1)

    // Undenylist the entity
    await server.undenylistEntity(entityBeingDeployed, decentralandIdentity)

    // Assert that the entity is no longer reported as target
    const targetsAfterUndenylist = await server.getDenylistTargets()
    expect(targetsAfterUndenylist.length).toBe(0)
  })

  it(`When random identity tries to denylist an entity, then an error is thrown`, async () => {
    // Prepare entity to deploy
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'], { metadata })

    // Deploy the entity
    await server.deploy(deployData)

    // Denylist the entity
    await assertPromiseIsRejected(() => server.denylistEntity(entityBeingDeployed, createIdentity()))
  })

  it(`When random identity tries to denylist some content, then an error is thrown`, async () => {
    // Prepare entity to deploy
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'], {
      metadata,
      contentPaths: ['content/test/integration/resources/some-binary-file.png']
    })
    const contentHash = entityBeingDeployed.content![0].hash

    // Deploy the entity
    await server.deploy(deployData)

    // Denylist the content
    await assertPromiseIsRejected(() => server.denylistContent(contentHash, createIdentity()))
  })

  it(`When cluster owner tries to denylist content, then it is successful`, async () => {
    // Prepare entity to deploy
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'], { metadata })

    // Deploy the entity
    await server.deploy(deployData)

    // Denylist the entity
    await server.denylistEntity(entityBeingDeployed, ownerIdentity)

    // Assert that audit info marks the entity as denylisted
    await assertEntityIsDenylisted(server, entityBeingDeployed)
  })

  it(`When cluster owner tries to denylist an entity, then it is successful`, async () => {
    // Prepare entity to deploy
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'], {
      metadata,
      contentPaths: ['content/test/integration/resources/some-binary-file.png']
    })
    const contentHash = entityBeingDeployed.content![0].hash

    // Deploy the entity
    await server.deploy(deployData)

    // Denylist the content
    await server.denylistContent(contentHash, ownerIdentity)

    // Assert that audit info marks content entity as denylisted
    await assertContentIsDenylisted(server, entityBeingDeployed, contentHash)
  })

  it(`When wrong block signature is sent, then an error is thrown`, async () => {
    // Prepare entity to deploy
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'], { metadata })

    // Deploy the entity
    await server.deploy(deployData)

    // Denylist the entity
    await assertPromiseIsRejected(() => server.denylistEntity(entityBeingDeployed, ownerIdentity, 'wrong-signature'))
  })

  it(`When wrong unblock signature is sent, then an error is thrown`, async () => {
    // Prepare entity to deploy
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'], { metadata })

    // Deploy the entity
    await server.deploy(deployData)

    // Denylist the content
    await server.denylistEntity(entityBeingDeployed, ownerIdentity)

    // Assert that audit info marks content entity as denylisted
    await assertEntityIsDenylisted(server, entityBeingDeployed)

    // Denylist the entity
    await assertPromiseIsRejected(() => server.undenylistEntity(entityBeingDeployed, ownerIdentity, 'wrong-signature'))
  })
})

function getTargetIdFromEntity(entity: ControllerEntity) {
  return buildEntityTarget(entity.type, entity.id).getId()
}
