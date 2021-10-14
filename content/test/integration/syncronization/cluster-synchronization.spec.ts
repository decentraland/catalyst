import { Timestamp } from 'dcl-catalyst-commons'
import ms from 'ms'
import {
  assertDeploymentsAreReported,
  assertEntitiesAreActiveOnServer,
  assertEntitiesAreDeployedButNotActive,
  assertEntityIsNotOverwritten,
  assertEntityIsOverwrittenBy,
  buildDeployment
} from '../E2EAssertions'
import { loadTestEnvironment } from '../E2ETestEnvironment'
import { awaitUntil, buildDeployData, buildDeployDataAfterEntity } from '../E2ETestUtils'
import { TestServer } from '../TestServer'

describe('End 2 end synchronization tests', function () {
  const SYNC_INTERVAL: number = ms('1s')
  const testEnv = loadTestEnvironment()
  let server1: TestServer, server2: TestServer, server3: TestServer

  beforeEach(async () => {
    ;[server1, server2, server3] = await testEnv.configServer(SYNC_INTERVAL).andBuildMany(3)
  })

  it(`When a server gets some content uploaded, then the other servers download it`, async () => {
    // Start server 1 and 2
    await Promise.all([server1.start(), server2.start()])

    // Prepare data to be deployed
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['X1,Y1'], {
      metadata: 'metadata'
    })

    // Make sure there are no deployments on server 1
    await assertDeploymentsAreReported(server1)

    // Make sure there are no deployments on server 2
    await assertDeploymentsAreReported(server2)

    // Deploy the entity to server 1
    const deploymentTimestamp: Timestamp = await server1.deploy(deployData)
    const deployment = buildDeployment(deployData, entityBeingDeployed, deploymentTimestamp)

    // Assert that the entity was deployed on server 1
    await assertDeploymentsAreReported(server1, deployment)

    // Assert that the entity was synced from server 1 to server 2
    await awaitUntil(() => assertEntitiesAreActiveOnServer(server2, entityBeingDeployed))
    await assertDeploymentsAreReported(server2, deployment)
  })

  it(`When a server finds a new deployment with already known content, it can still deploy it successfully`, async () => {
    // Start server 1 and 2
    await Promise.all([server1.start(), server2.start()])

    // Prepare data to be deployed
    const { deployData: deployData1, controllerEntity: entityBeingDeployed1 } = await buildDeployData(['X1,Y1'], {
      metadata: 'metadata',
      contentPaths: ['test/integration/resources/some-binary-file.png']
    })
    const { deployData: deployData2, controllerEntity: entityBeingDeployed2 } = await buildDeployDataAfterEntity(
      entityBeingDeployed1,
      ['X2,Y2'],
      {
        metadata: 'metadata',
        contentPaths: ['test/integration/resources/some-binary-file.png']
      }
    )

    // Deploy entity 1 on server 1
    const deploymentTimestamp1 = await server1.deploy(deployData1)
    const deployment1 = buildDeployment(deployData1, entityBeingDeployed1, deploymentTimestamp1)

    // Wait for servers to sync
    await awaitUntil(() => assertDeploymentsAreReported(server2, deployment1))

    // Deploy entity 2 on server 2
    const deploymentTimestamp2 = await server2.deploy(deployData2)
    const deployment2 = buildDeployment(deployData2, entityBeingDeployed2, deploymentTimestamp2)

    // Assert that the entities were deployed on the servers
    await awaitUntil(() => assertDeploymentsAreReported(server1, deployment1, deployment2))
    await assertDeploymentsAreReported(server2, deployment1, deployment2)
  })

  /**
   * This test verifies a very corner case where:
   * A. entityTimestamp(E1) < entityTimestamp(E2) < entityTimestamp(E3)
   * B. Entity E2 is deployed on a server S, with pointers P2, P3. But the server where it was deployed,
   *    quickly goes down, before the others can see the update
   * C. Entity E1 is then deployed on one of the servers that is up, with same pointers P1, P2
   * D. Entity E3 is deployed on one of the servers that is up, with pointers P3, P4.
   * Now, until S comes up again, all other servers in the cluster should see E1 and E3. But when S starts, then
   * only E3 should be present on all servers.
   *
   */
  it("When a lost update is detected, previous entities are deleted but new ones aren't", async () => {
    // Start server 2
    await Promise.all([server2.start()])

    // Prepare data to be deployed
    const { deployData: deployData1, controllerEntity: entity1 } = await buildDeployData(['X1,Y1', 'X2,Y2'], {
      metadata: 'metadata'
    })
    const { deployData: deployData2, controllerEntity: entity2 } = await buildDeployDataAfterEntity(
      entity1,
      ['X2,Y2', 'X3,Y3'],
      { metadata: 'metadata2' }
    )
    const { deployData: deployData3, controllerEntity: entity3 } = await buildDeployDataAfterEntity(
      entity2,
      ['X3,Y3', 'X4,Y4'],
      { metadata: 'metadata3' }
    )

    // Deploy entity 2
    const deploymentTimestamp2: Timestamp = await server2.deploy(deployData2)
    const deployment2 = buildDeployment(deployData2, entity2, deploymentTimestamp2)

    // Stop server 2
    await server2.stop({ deleteStorage: false, endDbConnection: false })

    // Start servers 1 and 3
    await Promise.all([server1.start(), server3.start()])

    // Deploy entities 1 and 3
    const deploymentTimestamp1: Timestamp = await server1.deploy(deployData1)
    const deployment1 = buildDeployment(deployData1, entity1, deploymentTimestamp1)

    const deploymentTimestamp3: Timestamp = await server3.deploy(deployData3)
    const deployment3 = buildDeployment(deployData3, entity3, deploymentTimestamp3)

    // Wait for servers 1 and 3 to sync
    await awaitUntil(() => assertDeploymentsAreReported(server1, deployment1, deployment3))
    await awaitUntil(() => assertDeploymentsAreReported(server3, deployment1, deployment3))

    // Make sure that both server 1 and 3 have entity E1 and E3 currently active
    await assertEntitiesAreActiveOnServer(server1, entity1, entity3)
    await assertEntitiesAreActiveOnServer(server3, entity1, entity3)

    // Restart server 2
    await server2.start()

    // Wait for servers to sync
    await awaitUntil(() => assertDeploymentsAreReported(server1, deployment2, deployment1, deployment3))
    await awaitUntil(() => assertDeploymentsAreReported(server2, deployment2, deployment1, deployment3))
    await awaitUntil(() => assertDeploymentsAreReported(server3, deployment2, deployment1, deployment3))

    // Make assertions on Server 1
    await assertEntitiesAreActiveOnServer(server1, entity3)
    await assertEntitiesAreDeployedButNotActive(server1, entity1, entity2)
    await assertEntityIsOverwrittenBy(server1, entity1, entity2)
    await assertEntityIsOverwrittenBy(server1, entity2, entity3)
    await assertEntityIsNotOverwritten(server1, entity3)

    // Make assertions on Server 2
    await assertEntitiesAreActiveOnServer(server2, entity3)
    await assertEntitiesAreDeployedButNotActive(server2, entity1, entity2)
    await assertEntityIsOverwrittenBy(server2, entity1, entity2)
    await assertEntityIsOverwrittenBy(server2, entity2, entity3)
    await assertEntityIsNotOverwritten(server2, entity3)

    // Make assertions on Server 3
    await assertEntitiesAreActiveOnServer(server3, entity3)
    await assertEntitiesAreDeployedButNotActive(server3, entity1, entity2)
    await assertEntityIsOverwrittenBy(server3, entity1, entity2)
    await assertEntityIsOverwrittenBy(server3, entity2, entity3)
    await assertEntityIsNotOverwritten(server3, entity3)
  })
})
