import { ContentFileHash, Timestamp } from 'dcl-catalyst-commons'
import {
  assertDeploymentsAreReported,
  assertEntitiesAreActiveOnServer,
  assertEntityIsOverwrittenBy,
  assertFileIsOnServer,
  buildDeployment
} from '../E2EAssertions'
import { loadTestEnvironment } from '../E2ETestEnvironment'
import { awaitUntil, buildDeployData, buildDeployDataAfterEntity } from '../E2ETestUtils'
import { TestServer } from '../TestServer'

describe('End 2 end - Node onboarding', function () {
  const testEnv = loadTestEnvironment()
  let server1: TestServer, server2: TestServer, server3: TestServer

  beforeEach(async () => {
    ;[server1, server2, server3] = await testEnv.configServer('1s').andBuildMany(3)
  })

  it('When a node starts, it does not get all the previous history', async () => {
    // Start server 1 and 2
    await Promise.all([server1.start(), server2.start()])

    // Prepare data to be deployed
    const { deployData: deployData1, controllerEntity: entity1 } = await buildDeployData(['X1,Y1', 'X2,Y2'], {
      metadata: 'metadata',
      contentPaths: ['test/integration/resources/some-binary-file.png']
    })
    const entity1ContentHash: ContentFileHash = entity1.content![0].hash
    const { deployData: deployData2, controllerEntity: entity2 } = await buildDeployDataAfterEntity(
      entity1,
      ['X2,Y2'],
      { metadata: 'metadata2' }
    )

    // Deploy entity1 on server 1
    const deploymentTimestamp1: Timestamp = await server1.deploy(deployData1)
    const deployment1 = buildDeployment(deployData1, entity1, deploymentTimestamp1)

    // Deploy entity2 on server 2
    const deploymentTimestamp2: Timestamp = await server2.deploy(deployData2)
    const deployment2 = buildDeployment(deployData2, entity2, deploymentTimestamp2)

    // Wait for servers to sync and assert servers 1 and 2 are synced
    await awaitUntil(() => assertDeploymentsAreReported(server1, deployment1, deployment2))
    await awaitUntil(() => assertDeploymentsAreReported(server2, deployment1, deployment2))

    await assertFileIsOnServer(server1, entity1ContentHash)
    await assertEntityIsOverwrittenBy(server1, entity1, entity2)
    await assertEntityIsOverwrittenBy(server2, entity1, entity2)

    // Start server 3
    await server3.start()

    // Assert server 3 has the latest deployment
    await awaitUntil(async () => {
      return assertEntitiesAreActiveOnServer(server3, entity2)
    })
  })

  it('When a node starts, it even gets history for nodes that are no longer on the DAO', async () => {
    // Start server 1 and 2
    await Promise.all([server1.start(), server2.start()])

    // Prepare data to be deployed
    const { deployData, controllerEntity: entity } = await buildDeployData(['X1,Y1', 'X2,Y2'], {
      metadata: 'metadata',
      contentPaths: ['test/integration/resources/some-binary-file.png']
    })
    const entityContentHash: ContentFileHash = entity.content![0].hash

    // Deploy entity on server 1
    const deploymentTimestamp: Timestamp = await server1.deploy(deployData)
    const deployment = buildDeployment(deployData, entity, deploymentTimestamp)

    // Wait for sync and assert servers 1 and 2 are synced
    await assertDeploymentsAreReported(server1, deployment)
    await awaitUntil(() => assertDeploymentsAreReported(server2, deployment))
    await assertFileIsOnServer(server1, entityContentHash)
    await assertFileIsOnServer(server2, entityContentHash)

    // Remove server 1 from the DAO
    testEnv.removeFromDAO(server1.getUrl())

    // Start server 3
    await server3.start()

    await awaitUntil(() => assertDeploymentsAreReported(server3, deployment))

    // Make sure that even the content is properly propagated
    await assertFileIsOnServer(server1, entityContentHash)
  })
})
