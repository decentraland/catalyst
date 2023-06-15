import { makeNoopDeploymentValidator, makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import {
  assertDeploymentsAreReported,
  assertEntitiesAreActiveOnServer,
  assertEntityIsOverwrittenBy,
  assertFileIsOnServer,
  buildDeployment
} from '../E2EAssertions'
import { setupTestEnvironment } from '../E2ETestEnvironment'
import { awaitUntil, buildDeployData, buildDeployDataAfterEntity } from '../E2ETestUtils'
import { getIntegrationResourcePathFor } from '../resources/get-resource-path'
import { TestProgram } from '../TestProgram'

describe('End 2 end - Node onboarding', function () {
  const getTestEnv = setupTestEnvironment()

  let server1: TestProgram, server2: TestProgram, server3: TestProgram

  beforeEach(async () => {
    ;[server1, server2, server3] = await getTestEnv().configServer().andBuildMany(3)

    makeNoopValidator(server1.components)
    makeNoopValidator(server2.components)
    makeNoopValidator(server3.components)
    makeNoopDeploymentValidator(server1.components)
    makeNoopDeploymentValidator(server2.components)
    makeNoopDeploymentValidator(server3.components)
  })

  // TODO: [new-sync] don't know why this keeps failing :(
  xit('When a node starts, it gets the active entities', async () => {
    // Start server 1 and 2
    await Promise.all([server1.startProgram(), server2.startProgram()])

    // Prepare data to be deployed
    const { deployData: deployData1, entity: entity1 } = await buildDeployData(['X1,Y1', 'X2,Y2'], {
      metadata: { a: 'metadata' },
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
    })
    const entity1ContentHash = entity1.content![0].hash
    const { deployData: deployData2, entity: entity2 } = await buildDeployDataAfterEntity(entity1, ['X2,Y2'], {
      metadata: { a: 'metadata2' }
    })

    // Deploy entity1 on server 1
    const deploymentTimestamp1 = await server1.deployEntity(deployData1)
    const deployment1 = buildDeployment(deployData1, entity1, deploymentTimestamp1)

    // Deploy entity2 on server 2
    const deploymentTimestamp2 = await server2.deployEntity(deployData2)
    const deployment2 = buildDeployment(deployData2, entity2, deploymentTimestamp2)

    // Wait for servers to sync and assert servers 1 and 2 are synced
    await awaitUntil(() => assertDeploymentsAreReported(server1, deployment1, deployment2))
    await awaitUntil(() => assertDeploymentsAreReported(server2, deployment1, deployment2))

    await assertFileIsOnServer(server1, entity1ContentHash)
    await assertEntityIsOverwrittenBy(server1, entity1, entity2)
    await assertEntityIsOverwrittenBy(server2, entity1, entity2)

    // Start server 3
    await server3.startProgram()

    // Assert server 3 has the latest deployment
    await awaitUntil(async () => {
      return assertEntitiesAreActiveOnServer(server3, entity2)
    })
  })

  it('When a node starts, it even gets history for nodes that are no longer on the DAO', async () => {
    // Start server 1 and 2
    await Promise.all([server1.startProgram(), server2.startProgram()])

    // Prepare data to be deployed
    const { deployData, entity } = await buildDeployData(['X1,Y1', 'X2,Y2'], {
      metadata: { a: 'metadata' },
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
    })
    const entityContentHash = entity.content![0].hash

    // Deploy entity on server 1
    const deploymentTimestamp = await server1.deployEntity(deployData)
    const deployment = buildDeployment(deployData, entity, deploymentTimestamp)

    // Wait for sync and assert servers 1 and 2 are synced
    await assertDeploymentsAreReported(server1, deployment)
    await awaitUntil(() => assertDeploymentsAreReported(server2, deployment))
    await assertFileIsOnServer(server1, entityContentHash)
    await assertFileIsOnServer(server2, entityContentHash)

    // Remove server 1 from the DAO
    getTestEnv().removeFromDAO(server1.getUrl())

    // Start server 3
    await server3.startProgram()

    await awaitUntil(() => assertDeploymentsAreReported(server3, deployment))

    // Make sure that even the content is properly propagated
    await assertFileIsOnServer(server3, entityContentHash)
  })
})
