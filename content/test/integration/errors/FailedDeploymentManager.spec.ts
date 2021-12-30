import { createTestMetricsComponent } from '@well-known-components/metrics'
import { EntityId, EntityType } from 'dcl-catalyst-commons'
import { random } from 'faker'
import { stopAllComponents } from '../../../src/logic/components-lifecycle'
import { metricsDeclaration } from '../../../src/metrics'
import { Repository } from '../../../src/repository/Repository'
import { RepositoryFactory } from '../../../src/repository/RepositoryFactory'
import { DB_REQUEST_PRIORITY } from '../../../src/repository/RepositoryQueue'
import {
  DeploymentStatus,
  FailedDeployment,
  FailedDeploymentsManager,
  FailureReason,
  NoFailure
} from '../../../src/service/errors/FailedDeploymentsManager'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'

loadStandaloneTestEnvironment()('Integration - Failed Deployments Manager', function (testEnv) {
  function testCaseWithRepository(
    name: string,
    fn: (repository: Repository, manager: FailedDeploymentsManager) => Promise<void>
  ) {
    it(name, async () => {
      const env = await testEnv.getEnvForNewDatabase()
      const metrics = createTestMetricsComponent(metricsDeclaration)
      const repository = await RepositoryFactory.create({ env, metrics })
      const manager = new FailedDeploymentsManager()
      try {
        await fn(repository, manager)
      } finally {
        await stopAllComponents({ repository, manager })
      }
    })
  }

  testCaseWithRepository(
    `When failures are reported, then the last status is returned`,
    async (repository, manager) => {
      const deployment = buildRandomDeployment()

      await reportDeployment({ repository, manager, deployment, reason: FailureReason.DEPLOYMENT_ERROR })

      let status = await getDeploymentStatus(repository, manager, deployment)
      expect(status).toBe(FailureReason.DEPLOYMENT_ERROR)
    }
  )

  testCaseWithRepository(`When failures are reported, then all are reported correctly`, async (repository, manager) => {
    const deployment1 = buildRandomDeployment()
    const deployment2 = buildRandomDeployment()

    reportDeployment({
      repository,
      manager,
      deployment: deployment1,
      reason: FailureReason.DEPLOYMENT_ERROR,
      description: 'description'
    })
    reportDeployment({ repository, manager, deployment: deployment2, reason: FailureReason.DEPLOYMENT_ERROR })

    const [failed1, failed2]: Array<FailedDeployment> = manager.getAllFailedDeployments()

    assertFailureWasDueToDeployment(failed1, deployment2)
    expect(failed1.reason).toBe(FailureReason.DEPLOYMENT_ERROR)
    expect(failed1.errorDescription).toBeUndefined()
    assertFailureWasDueToDeployment(failed2, deployment1)
    expect(failed2.reason).toBe(FailureReason.DEPLOYMENT_ERROR)
    expect(failed2.errorDescription).toEqual('description')
  })

  testCaseWithRepository(
    `When successful deployment is reported, then all previous failures of such reported are deleted`,
    async (repository, manager) => {
      const deployment = buildRandomDeployment()

      reportDeployment({ repository, manager, deployment, reason: FailureReason.DEPLOYMENT_ERROR })

      manager.reportSuccessfulDeployment(deployment.entityType, deployment.entityId)

      const status = await getDeploymentStatus(repository, manager, deployment)
      expect(status).toBe(NoFailure.NOT_MARKED_AS_FAILED)
    }
  )

  function assertFailureWasDueToDeployment(failedDeployment: FailedDeployment, deployment: FakeDeployment) {
    expect(failedDeployment.entityId).toEqual(deployment.entityId)
    expect(failedDeployment.entityType).toEqual(deployment.entityType)
  }

  function reportDeployment({
    repository,
    manager,
    deployment,
    reason,
    description
  }: {
    repository: Repository
    manager: FailedDeploymentsManager
    deployment: FakeDeployment
    reason: FailureReason
    description?: string
  }): void {
    const { entityType, entityId } = deployment
    manager.reportFailure(entityType, entityId, reason, [], description)
  }

  function getDeploymentStatus(
    repository: Repository,
    manager: FailedDeploymentsManager,
    deployment: FakeDeployment
  ): Promise<DeploymentStatus> {
    return repository.run(
      (db) => manager.getDeploymentStatus(deployment.entityType, deployment.entityId),
      { priority: DB_REQUEST_PRIORITY.LOW }
    )
  }

  function buildRandomDeployment(): FakeDeployment {
    const event: FakeDeployment = {
      entityType: EntityType.PROFILE,
      entityId: random.alphaNumeric(10)
    }
    return event
  }
})

type FakeDeployment = {
  entityType: EntityType
  entityId: EntityId
}
