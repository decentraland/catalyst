import { Entity } from '@dcl/schemas'
import { DeploymentData } from 'dcl-catalyst-client/dist/client/utils/DeploymentBuilder'
import { EnvironmentConfig } from '../../../src/Environment'
import { retryFailedDeploymentExecution } from '../../../src/logic/deployments'
import { FailedDeployment, FailureReason } from '../../../src/ports/failedDeployments'
import { assertDeploymentFailed, assertEntitiesAreActiveOnServer } from '../E2EAssertions'
import { setupTestEnvironment } from '../E2ETestEnvironment'
import { awaitUntil, buildDeployData, buildDeployDataAfterEntity, createIdentity } from '../E2ETestUtils'
import { TestProgram, startProgramAndWaitUntilBootstrapFinishes } from '../TestProgram'
import { getIntegrationResourcePathFor } from '../resources/get-resource-path'
import { makeNoopDeploymentValidator } from '../../helpers/service/validations/NoOpValidator'

describe('Errors during sync', () => {
  const getTestEnv = setupTestEnvironment()

  let server1: TestProgram
  let server2: TestProgram
  let entity: Entity
  let deployData: DeploymentData
  let serverValidatorStub2: jest.SpyInstance

  describe('Deploy an entity on server 1', function () {
    beforeEach(async function () {
      const identity = createIdentity()
      ;[server1, server2] = await getTestEnv()
        .configServer()
        .withConfig(EnvironmentConfig.DECENTRALAND_ADDRESS, identity.address)
        .andBuildMany(2)
      // Start server1
      await server1.startProgram()

      jest.spyOn(server1.components.validator, 'validate').mockResolvedValue({ ok: true })
      jest.spyOn(server2.components.validator, 'validate').mockResolvedValue({ ok: true })

      makeNoopDeploymentValidator(server1.components)
      makeNoopDeploymentValidator(server2.components)

      serverValidatorStub2 = jest
        .spyOn(server2.components.serverValidator, 'validate')
        .mockResolvedValueOnce({ ok: false, message: 'anyError' })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })

      // Prepare entity to deploy
      const entityCombo = await buildDeployData(['0,0', '0,1'], {
        metadata: { a: 'metadata' },
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })

      entity = entityCombo.entity
      deployData = entityCombo.deployData

      // Deploy the entity
      await server1.deployEntity(deployData)
      await awaitUntil(() => assertEntitiesAreActiveOnServer(server1, entity))

      // Start server2
      await startProgramAndWaitUntilBootstrapFinishes(server2)
    })

    it('stores it as failed deployment locally', async function () {
      await awaitUntil(() => assertDeploymentFailed(server2, FailureReason.DEPLOYMENT_ERROR, entity))
    })

    it('fix the failed entity on server2 when retrying it, is correclty deployed', async () => {
      await awaitUntil(() => assertDeploymentFailed(server2, FailureReason.DEPLOYMENT_ERROR, entity))
      // Fix the entity
      await server2.deployEntity(deployData, true)
      await awaitUntil(() => assertEntitiesAreActiveOnServer(server2, entity))
      const newFailedDeployments: FailedDeployment[] = await server2.getFailedDeployments()
      expect(newFailedDeployments.length).toBe(0)
    })

    it('fix the failed entity on server2 after a new one was correctly deployed', async () => {
      await awaitUntil(() => assertDeploymentFailed(server2, FailureReason.DEPLOYMENT_ERROR, entity))

      // Deploy a new entity for the same pointer
      const anotherEntityCombo = await buildDeployDataAfterEntity(entity, ['0,1'], {
        metadata: { a: 'metadata2' }
      })
      // Deploy entity 2 on server 2
      await server2.deployEntity(anotherEntityCombo.deployData)
      await awaitUntil(() => assertEntitiesAreActiveOnServer(server2, anotherEntityCombo.entity))

      // Fix the entity
      await server2.deployEntity(deployData, true)

      // The active entity is not modified
      await awaitUntil(() => assertEntitiesAreActiveOnServer(server2, anotherEntityCombo.entity))

      // Is removed from failed
      await awaitUntil(async () => {
        const newFailedDeployments: FailedDeployment[] = await server2.getFailedDeployments()
        expect(newFailedDeployments.length).toBe(0)
      })
    })

    it('ignore to fix the failed deployment when there are newer entities', async () => {
      // Deploy a new entity for the same pointer
      const anotherEntityCombo = await buildDeployDataAfterEntity(entity, ['0,1'], {
        metadata: { a: 'metadata2' }
      })
      // Wait until entity from sync is deployed and failed
      await awaitUntil(() => assertDeploymentFailed(server2, FailureReason.DEPLOYMENT_ERROR, entity))
      // Deploy entity 2 (with same pointers) on server 2
      await server2.deployEntity(anotherEntityCombo.deployData)
      await awaitUntil(() => assertEntitiesAreActiveOnServer(server2, anotherEntityCombo.entity))

      // Restore server validations to detect the newer entity
      serverValidatorStub2.mockRestore()

      await retryFailedDeploymentExecution(server2.components)

      // It is removed from failed
      await awaitUntil(async () => {
        const newFailedDeployments: FailedDeployment[] = await server2.getFailedDeployments()
        expect(newFailedDeployments.length).toBe(0)
      })
    })
  })
})
