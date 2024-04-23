import { Entity } from '@dcl/schemas'
import ms from 'ms'
import { EnvironmentConfig } from '../../../src/Environment'
import { FailedDeployment, FailureReason } from '../../../src/ports/failedDeployments'
import {
  makeNoopDeploymentValidator,
  makeNoopServerValidator,
  makeNoopValidator
} from '../../helpers/service/validations/NoOpValidator'
import {
  assertDeploymentFailed,
  assertDeploymentsAreReported,
  assertEntitiesAreActiveOnServer,
  assertEntitiesAreDeployedButNotActive,
  assertEntityWasNotDeployed,
  assertThereIsAFailedDeployment,
  buildDeployment
} from '../E2EAssertions'
import { awaitUntil, buildDeployData, buildDeployDataAfterEntity, createIdentity } from '../E2ETestUtils'
import { TestProgram } from '../TestProgram'
import { createAdditionalServer, createDefaultServer } from '../simpleTestEnvironment'

describe('End 2 end - Error handling', () => {
  const identity = createIdentity()
  let server1: TestProgram, server2: TestProgram

  beforeAll(async () => {
    const config = {
      [EnvironmentConfig.DECENTRALAND_ADDRESS]: identity.address,
      [EnvironmentConfig.REQUEST_TTL_BACKWARDS]: ms('2s'),
      [EnvironmentConfig.DISABLE_SYNCHRONIZATION]: true
    }
    server1 = await createDefaultServer(config)
    makeNoopValidator(server1.components)
    makeNoopServerValidator(server1.components)
    makeNoopDeploymentValidator(server1.components)

    server2 = await createAdditionalServer(server1, 1201, config)
    makeNoopValidator(server2.components)
    makeNoopServerValidator(server2.components)
    makeNoopDeploymentValidator(server2.components)
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    await server1.stopProgram()
    server1 = null as any
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    await server2.stopProgram()
    server2 = null as any
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
    // Prepare entity to deploy
    const { deployData: deployData1, entity: entityBeingDeployed1 } = await buildDeployData(['0,0', '0,1'], {
      metadata: { a: 'metadata' },
      contentPaths: ['test/integration/resources/some-binary-file.png']
    })

    // Deploy entity 1
    await server1.deployEntity(deployData1)

    // Cause sync failure
    // TODO!: Add sync failure

    // Assert deployment is marked as failed on server 2
    await awaitUntil(() => assertThereIsAFailedDeployment(server2))

    // Prepare entity to deploy
    const { deployData: deployData2, entity: entityBeingDeployed2 } = await buildDeployDataAfterEntity(
      entityBeingDeployed1,
      ['0,1'],
      { metadata: { a: 'metadata2' } }
    )

    // Deploy entity 2 on server 2
    await server2.deployEntity(deployData2)

    // Fix entity 1 on server 2
    await server2.deployEntity(deployData1, true)

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
    // Prepare entity to deploy
    const { deployData, entity } = await buildDeployData(['0,0', '0,1'], { metadata: { a: 'metadata' } })

    // Try to deploy the entity, and fail
    await server1.deployEntity(deployData, true)

    // asser that the entity got deployed
    await assertEntitiesAreActiveOnServer(server1, entity)
  })

  it(`When a user tries to fix an entity that hadn't fail, then it is an idempotent operation`, async () => {
    // Prepare entity to deploy
    const { deployData } = await buildDeployData(['0,0', '0,1'], { metadata: { a: 'metadata' } })

    // Deploy the entity
    const firstDeploymentDatetime = await server1.deployEntity(deployData)

    // Try to fix the entity, and fail
    const fixDatetime = await server1.deployEntity(deployData, true)

    // expect idempotent operation to return the datetime of the deploy
    expect(firstDeploymentDatetime).toEqual(fixDatetime)
  })

  async function runTest(
    errorType: FailureReason,
    causeOfFailure: (entity: Entity) => Promise<void>,
    removeCauseOfFailure?: () => Promise<void>
  ) {
    // Prepare entity to deploy
    const { deployData, entity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'], {
      metadata: { a: 'metadata' },
      contentPaths: ['test/integration/resources/some-binary-file.png']
    })

    // Deploy the entity
    const deploymentTimestamp = await server1.deployEntity(deployData)

    // Cause failure
    await causeOfFailure(entityBeingDeployed)

    // Assert deployment is marked as failed
    await awaitUntil(() => assertDeploymentFailed(server2, errorType, entityBeingDeployed))

    // Assert entity wasn't deployed
    await assertEntityWasNotDeployed(server2, entityBeingDeployed)

    // Assert history was not modified
    await assertDeploymentsAreReported(server2)

    // Remove cause of failure
    if (removeCauseOfFailure) await removeCauseOfFailure()

    // Fix the entity
    await server2.deployEntity(deployData, true)

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
