import { Entity } from '@dcl/schemas'
import { DeploymentData } from 'dcl-catalyst-client'
import { SinonStub, stub } from 'sinon'
import { EnvironmentConfig } from '../../../src/Environment'
import { retryFailedDeploymentExecution } from '../../../src/logic/deployments'
import { FailedDeployment, FailureReason } from '../../../src/ports/failedDeployments'
import { assertDeploymentFailed, assertDeploymentFailsWith, assertEntitiesAreActiveOnServer } from '../E2EAssertions'
import { setupTestEnvironment } from '../E2ETestEnvironment'
import { awaitUntil, buildDeployData, buildDeployDataAfterEntity, createIdentity } from '../E2ETestUtils'
import { getIntegrationResourcePathFor } from '../resources/get-resource-path'
import { startProgramAndWaitUntilBootstrapFinishes, TestProgram } from '../TestProgram'

describe('Errors during sync', () => {
  const getTestEnv = setupTestEnvironment()

  let server1: TestProgram
  let server2: TestProgram
  let controllerEntity: Entity
  let deployData: DeploymentData
  let validatorStub1: SinonStub
  let validatorStub2: SinonStub
  let serverValidatorStub2: SinonStub
  describe('Deploy an entity on server 1', function () {
    beforeEach(async function () {
      const identity = createIdentity()
      ;[server1, server2] = await getTestEnv()
        .configServer()
        .withConfig(EnvironmentConfig.DECENTRALAND_ADDRESS, identity.address)
        .andBuildMany(2)
      // Start server1
      await server1.startProgram()

      validatorStub1 = stub(server1.components, 'validator')
      validatorStub1.returns(Promise.resolve({ ok: true }))
      validatorStub2 = stub(server2.components, 'validator')
      validatorStub2.returns(Promise.resolve({ ok: true }))

      serverValidatorStub2 = stub(server2.components.serverValidator, 'validate')
      serverValidatorStub2.onCall(0).returns(Promise.resolve({ ok: false, message: 'anyError' }))
      serverValidatorStub2.onCall(1).returns(Promise.resolve({ ok: true }))
      serverValidatorStub2.onCall(2).returns(Promise.resolve({ ok: true }))
      serverValidatorStub2.onCall(3).returns(Promise.resolve({ ok: true }))

      // Prepare entity to deploy
      const entityCombo = await buildDeployData(['0,0', '0,1'], {
        metadata: { a: 'metadata' },
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })

      controllerEntity = entityCombo.controllerEntity
      deployData = entityCombo.deployData

      // Deploy the entity
      await server1.deployEntity(deployData)
      await awaitUntil(() => assertEntitiesAreActiveOnServer(server1, controllerEntity))

      // Start server2
      await startProgramAndWaitUntilBootstrapFinishes(server2)
    })

    afterEach(async function () {
      jest.restoreAllMocks()
    })

    it('stores it as failed deployment locally', async function () {
      await awaitUntil(() => assertDeploymentFailed(server2, FailureReason.DEPLOYMENT_ERROR, controllerEntity))
    })

    it('fix the failed entity on server2 when retrying it, is correclty deployed', async () => {
      await awaitUntil(() => assertDeploymentFailed(server2, FailureReason.DEPLOYMENT_ERROR, controllerEntity))
      // Fix the entity
      await server2.deployEntity(deployData, true)
      await awaitUntil(() => assertEntitiesAreActiveOnServer(server2, controllerEntity))
      const newFailedDeployments: FailedDeployment[] = await server2.getFailedDeployments()
      expect(newFailedDeployments.length).toBe(0)
    })

    it('fix the failed entity on server2 after a new one was correctly deployed', async () => {
      await awaitUntil(() => assertDeploymentFailed(server2, FailureReason.DEPLOYMENT_ERROR, controllerEntity))

      // Deploy a new entity for the same pointer
      const anotherEntityCombo = await buildDeployDataAfterEntity(controllerEntity, ['0,1'], {
        metadata: { a: 'metadata2' }
      })
      // Deploy entity 2 on server 2
      await server2.deployEntity(anotherEntityCombo.deployData)
      await awaitUntil(() => assertEntitiesAreActiveOnServer(server2, anotherEntityCombo.controllerEntity))

      // Fix the entity
      await server2.deployEntity(deployData, true)

      // The active entity is not modified
      await awaitUntil(() => assertEntitiesAreActiveOnServer(server2, anotherEntityCombo.controllerEntity))

      // Is removed from failed
      await awaitUntil(async () => {
        const newFailedDeployments: FailedDeployment[] = await server2.getFailedDeployments()
        expect(newFailedDeployments.length).toBe(0)
      })
    })

    it('ignore to fix the failed deployment when there are newer entities', async () => {
      // Deploy a new entity for the same pointer
      const anotherEntityCombo = await buildDeployDataAfterEntity(controllerEntity, ['0,1'], {
        metadata: { a: 'metadata2' }
      })
      // Wait until entity from sync is deployed and failed
      await awaitUntil(() => assertDeploymentFailed(server2, FailureReason.DEPLOYMENT_ERROR, controllerEntity))
      // Deploy entity 2 (with same pointers) on server 2
      await server2.deployEntity(anotherEntityCombo.deployData)
      await awaitUntil(() => assertEntitiesAreActiveOnServer(server2, anotherEntityCombo.controllerEntity))

      // Restore server validations to detect the newer entity
      serverValidatorStub2.restore()

      await retryFailedDeploymentExecution(server2.components)

      // It is removed from failed
      await awaitUntil(async () => {
        const newFailedDeployments: FailedDeployment[] = await server2.getFailedDeployments()
        expect(newFailedDeployments.length).toBe(0)
      })
    })
  })

  it('Deploy as fix a not failed entity fails', async () => {
    const identity = createIdentity()
    server1 = await getTestEnv()
      .configServer()
      .withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true)
      .withConfig(EnvironmentConfig.DECENTRALAND_ADDRESS, identity.address)
      .andBuild()

    validatorStub1 = stub(server1.components.serverValidator, 'validate')
    validatorStub1.returns(
      Promise.resolve({ ok: false, message: 'You are trying to fix an entity that is not marked as failed' })
    )

    // Start server1
    await server1.startProgram()

    // Prepare entity to deploy
    const entityCombo = await buildDeployData(['0,0', '0,1'], {
      metadata: { a: 'metadata' },
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
    })
    deployData = entityCombo.deployData
    controllerEntity = entityCombo.controllerEntity

    await assertDeploymentFailsWith(
      () => server1.deployEntity(deployData, true),
      'You are trying to fix an entity that is not marked as failed'
    )
  })
})
