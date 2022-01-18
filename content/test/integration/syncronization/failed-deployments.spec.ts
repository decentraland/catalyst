import { createIdentity } from 'eth-crypto'
import { stub } from 'sinon'
import { EnvironmentConfig } from '../../../src/Environment'
import { FailedDeployment, FailureReason } from '../../../src/ports/failedDeploymentsCache'
import { assertDeploymentFailed, assertDeploymentFailsWith, assertEntitiesAreActiveOnServer } from '../E2EAssertions'
import { loadTestEnvironment } from '../E2ETestEnvironment'
import { awaitUntil, buildDeployData, buildDeployDataAfterEntity } from '../E2ETestUtils'

loadTestEnvironment()('Errors during sync', (testEnv) => {
  describe('Deploy an entity on server 1', function () {
    beforeEach(async function () {
      this.identity = createIdentity()
      ;[this.server1, this.server2] = await testEnv
        .configServer('2s')
        .withConfig(EnvironmentConfig.DECENTRALAND_ADDRESS, this.identity.address)
        .withConfig(EnvironmentConfig.DISABLE_DENYLIST, false)
        .andBuildMany(2)

      // Start server1
      await this.server1.startProgram()

      this.validatorStub1 = stub(this.server1.components.validator, 'validate')
      this.validatorStub1.returns(Promise.resolve({ ok: true }))
      this.validatorStub2 = stub(this.server2.components.validator, 'validate')
      this.validatorStub2.returns(Promise.resolve({ ok: true }))

      this.serverValidatorStub2 = stub(this.server2.components.serverValidator, 'validate')
      this.serverValidatorStub2.onCall(0).returns(Promise.resolve({ ok: false, message: 'anyError' }))
      this.serverValidatorStub2.onCall(1).returns(Promise.resolve({ ok: true }))
      this.serverValidatorStub2.onCall(2).returns(Promise.resolve({ ok: true }))
      this.serverValidatorStub2.onCall(3).returns(Promise.resolve({ ok: true }))

      // Prepare entity to deploy
      const entityCombo = await buildDeployData(['0,0', '0,1'], {
        metadata: 'metadata',
        contentPaths: ['test/integration/resources/some-binary-file.png']
      })
      this.deployData = entityCombo.deployData
      this.controllerEntity = entityCombo.controllerEntity

      // Deploy the entity
      await this.server1.deploy(this.deployData)
      await awaitUntil(() => assertEntitiesAreActiveOnServer(this.server1, this.controllerEntity))

      // Start server2
      await this.server2.startProgram()
    })

    afterEach(async function () {
      this.validatorStub1.restore()
      this.validatorStub2.restore()
      this.serverValidatorStub2.restore()
    })

    it('stores it as failed deployment locally', async function () {
      await awaitUntil(() =>
        assertDeploymentFailed(this.server2, FailureReason.DEPLOYMENT_ERROR, this.controllerEntity)
      )
    })

    describe('fix the failed entity on server2 when retrying it', function () {
      beforeEach(async function () {
        await awaitUntil(() =>
          assertDeploymentFailed(this.server2, FailureReason.DEPLOYMENT_ERROR, this.controllerEntity)
        )

        // Fix the entity
        await this.server2.deploy(this.deployData, true)
      })

      it('is correctly deployed', async function () {
        await awaitUntil(() => assertEntitiesAreActiveOnServer(this.server2, this.controllerEntity))
      })

      it('is removed from failed', async function () {
        await awaitUntil(async () => {
          const newFailedDeployments: FailedDeployment[] = await this.server2.getFailedDeployments()
          expect(newFailedDeployments.length).toBe(0)
        })
      })
    })

    describe('fix the failed entity on server2 after a new one was correctly deployed', function () {
      beforeEach(async function () {
        await awaitUntil(() =>
          assertDeploymentFailed(this.server2, FailureReason.DEPLOYMENT_ERROR, this.controllerEntity)
        )

        // Deploy a new entity for the same pointer
        this.anotherEntityCombo = await buildDeployDataAfterEntity(this.controllerEntity, ['0,1'], {
          metadata: 'metadata2'
        })
        // Deploy entity 2 on server 2
        await this.server2.deploy(this.anotherEntityCombo.deployData)
        await awaitUntil(() => assertEntitiesAreActiveOnServer(this.server2, this.anotherEntityCombo.controllerEntity))

        // Fix the entity
        await this.server2.deploy(this.deployData, true)
      })

      it('the active entity is not modified', async function () {
        await awaitUntil(() => assertEntitiesAreActiveOnServer(this.server2, this.anotherEntityCombo.controllerEntity))
      })

      it('is removed from failed', async function () {
        await awaitUntil(async () => {
          const newFailedDeployments: FailedDeployment[] = await this.server2.getFailedDeployments()
          expect(newFailedDeployments.length).toBe(0)
        })
      })
    })
  })

  describe('Deploy as fix a not failed entity', function () {
    beforeEach(async function () {
      this.identity = createIdentity()
      this.server1 = await testEnv
        .configServer('2s')
        .withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true)
        .withConfig(EnvironmentConfig.DECENTRALAND_ADDRESS, this.identity.address)
        .withConfig(EnvironmentConfig.DISABLE_DENYLIST, false)
        .andBuild()

      this.validatorStub1 = stub(this.server1.components.serverValidator, 'validate')
      this.validatorStub1.returns(
        Promise.resolve({ ok: false, message: 'You are trying to fix an entity that is not marked as failed' })
      )

      // Start server1
      await this.server1.startProgram()

      // Prepare entity to deploy
      const entityCombo = await buildDeployData(['0,0', '0,1'], {
        metadata: 'metadata',
        contentPaths: ['test/integration/resources/some-binary-file.png']
      })
      this.deployData = entityCombo.deployData
      this.controllerEntity = entityCombo.controllerEntity
    })

    afterEach(async function () {
      this.validatorStub1.restore()
    })

    it('fails', async function () {
      await assertDeploymentFailsWith(
        () => this.server1.deploy(this.deployData, true),
        'You are trying to fix an entity that is not marked as failed'
      )
    })
  })
})
