import { Entity as ControllerEntity, Timestamp } from 'dcl-catalyst-commons'
import ms from 'ms'
import { EnvironmentConfig } from '../../../src/Environment'
import { FailedDeployment, FailureReason } from '../../../src/ports/failedDeploymentsCache'
import { makeNoopServerValidator, makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import {
  assertDeploymentFailed,
  assertDeploymentsAreReported,
  assertEntitiesAreActiveOnServer,
  assertEntitiesAreDeployedButNotActive,
  assertEntityWasNotDeployed,
  assertThereIsAFailedDeployment,
  buildDeployment
} from '../E2EAssertions'
import { loadTestEnvironment } from '../E2ETestEnvironment'
import { awaitUntil, buildDeployData, buildDeployDataAfterEntity, createIdentity } from '../E2ETestUtils'
import { getIntegrationResourcePathFor } from '../resources/get-resources-path'
import { TestProgram } from '../TestProgram'

loadTestEnvironment()('End 2 end - Error handling', (testEnv) => {
  const identity = createIdentity()
  let server1: TestProgram, server2: TestProgram

  beforeEach(async () => {
    ;[server1, server2] = await testEnv
      .configServer('2s')
      .withConfig(EnvironmentConfig.DECENTRALAND_ADDRESS, identity.address)
      .withConfig(EnvironmentConfig.REQUEST_TTL_BACKWARDS, ms('2s'))
      .andBuildMany(2)

    makeNoopValidator(server1.components)
    makeNoopServerValidator(server1.components)
    makeNoopValidator(server2.components)
    makeNoopServerValidator(server2.components)
  })

  //TODO: [new-sync] Check that this is being tested somewhere else
  xit(`When an error happens during deployment, then the error is recorded and no entity is created`, async () => {
    await runTest(
      FailureReason.DEPLOYMENT_ERROR,
      (_) => {
        // accessChecker.startReturningErrors()
        return Promise.resolve()
      },
      () => {
        // accessChecker.stopReturningErrors()
        return Promise.resolve()
      }
    )
  })

  //TODO: [new-sync] Fix this when deny-listed items are excluded from the snapshots and pointer changes
  xit(`When a user tries to fix an entity, it doesn't matter if there is already a newer entity deployed`, async () => {
    // Start servers
    await Promise.all([server1.startProgram(), server2.startProgram()])

    // Prepare entity to deploy
    const { deployData: deployData1, controllerEntity: entityBeingDeployed1 } = await buildDeployData(['0,0', '0,1'], {
      metadata: 'metadata',
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
    })
    const entity1Content = entityBeingDeployed1.content![0].hash

    // Deploy entity 1
    await server1.deploy(deployData1)

    // Cause sync failure
    // TODO!: Add sync failure

    // Assert deployment is marked as failed on server 2
    await awaitUntil(() => assertThereIsAFailedDeployment(server2))

    // Prepare entity to deploy
    const { deployData: deployData2, controllerEntity: entityBeingDeployed2 } = await buildDeployDataAfterEntity(
      entityBeingDeployed1,
      ['0,1'],
      { metadata: 'metadata2' }
    )

    // Deploy entity 2 on server 2
    await server2.deploy(deployData2)

    // Fix entity 1 on server 2
    await server2.deploy(deployData1, true)

    // Assert there are no more failed deployments
    const newFailedDeployments: FailedDeployment[] = await server2.getFailedDeployments()
    expect(newFailedDeployments.length).toBe(0)

    // Wait for servers to sync and assert entity 2 is the active entity on both servers
    await awaitUntil(() => assertEntitiesAreActiveOnServer(server1, entityBeingDeployed2))
    await assertEntitiesAreActiveOnServer(server2, entityBeingDeployed2)
    await assertEntitiesAreDeployedButNotActive(server1, entityBeingDeployed1)
    await assertEntitiesAreDeployedButNotActive(server2, entityBeingDeployed1)
  })

  it(`When a user tries to fix an entity that didn't exist, the entity gets deployed`, async () => {
    // Start server
    await server1.startProgram()

    // Prepare entity to deploy
    const { deployData, controllerEntity } = await buildDeployData(['0,0', '0,1'], { metadata: 'metadata' })

    // Try to deploy the entity, and fail
    await server1.deploy(deployData, true)

    // asser that the entity got deployed
    await assertEntitiesAreActiveOnServer(server1, controllerEntity)
  })

  it(`When a user tries to fix an entity that hadn't fail, then it is an idempotent operation`, async () => {
    // Start server
    await server1.startProgram()

    // Prepare entity to deploy
    const { deployData } = await buildDeployData(['0,0', '0,1'], { metadata: 'metadata' })

    // Deploy the entity
    const firstDeploymentDatetime = await server1.deploy(deployData)

    // Try to fix the entity, and fail
    const fixDatetime = await server1.deploy(deployData, true)

    // expect idempotent operation to return the datetime of the deploy
    expect(firstDeploymentDatetime).toEqual(fixDatetime)
  })

  async function runTest(
    errorType: FailureReason,
    causeOfFailure: (entity: ControllerEntity) => Promise<void>,
    removeCauseOfFailure?: () => Promise<void>
  ) {
    // Start server1
    await server1.startProgram()

    // Prepare entity to deploy
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'], {
      metadata: 'metadata',
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
    })

    // Deploy the entity
    const deploymentTimestamp: Timestamp = await server1.deploy(deployData)

    // Cause failure
    await causeOfFailure(entityBeingDeployed)

    // Start server2

    await server2.startProgram()

    // Assert deployment is marked as failed
    await awaitUntil(() => assertDeploymentFailed(server2, errorType, entityBeingDeployed))

    // Assert entity wasn't deployed
    await assertEntityWasNotDeployed(server2, entityBeingDeployed)

    // Assert history was not modified
    await assertDeploymentsAreReported(server2)

    // Remove cause of failure
    if (removeCauseOfFailure) await removeCauseOfFailure()

    // Fix the entity
    await server2.deploy(deployData, true)

    // Assert there are no more failed deployments
    const newFailedDeployments: FailedDeployment[] = await server2.getFailedDeployments()
    expect(newFailedDeployments.length).toBe(0)

    // Assert entity is there
    await assertEntitiesAreActiveOnServer(server2, entityBeingDeployed)

    const deployment = buildDeployment(deployData, entityBeingDeployed, deploymentTimestamp)

    // Assert history was modified
    await assertDeploymentsAreReported(server2, deployment)
  }
})
