import { EntityId, EntityType } from 'dcl-catalyst-commons'
import { random } from 'faker'
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

describe('Integration - Failed Deployments Manager', function () {
  const testEnv = loadStandaloneTestEnvironment()
  const manager = new FailedDeploymentsManager()
  let repository: Repository

  beforeEach(async () => {
    const env = await testEnv.getEnvForNewDatabase()
    repository = await RepositoryFactory.create(env)
  })

  afterEach(async () => {
    await repository.shutdown()
  })

  it(`When failures are reported, then the last status is returned`, async () => {
    const deployment = buildRandomDeployment()

    await reportDeployment({ deployment, reason: FailureReason.NO_ENTITY_OR_AUDIT })

    let status = await getDeploymentStatus(deployment)
    expect(status).toBe(FailureReason.NO_ENTITY_OR_AUDIT)

    await reportDeployment({ deployment, reason: FailureReason.DEPLOYMENT_ERROR })

    status = await getDeploymentStatus(deployment)
    expect(status).toBe(FailureReason.DEPLOYMENT_ERROR)
  })

  it(`When failures are reported, then all are reported correctly`, async () => {
    const deployment1 = buildRandomDeployment()
    const deployment2 = buildRandomDeployment()

    await reportDeployment({
      deployment: deployment1,
      reason: FailureReason.NO_ENTITY_OR_AUDIT,
      description: 'description'
    })
    await reportDeployment({ deployment: deployment2, reason: FailureReason.DEPLOYMENT_ERROR })

    const [failed1, failed2]: Array<FailedDeployment> = await repository.run(
      (db) => manager.getAllFailedDeployments(db.failedDeployments),
      { priority: DB_REQUEST_PRIORITY.LOW }
    )

    assertFailureWasDueToDeployment(failed1, deployment2)
    expect(failed1.reason).toBe(FailureReason.DEPLOYMENT_ERROR)
    expect(failed1.errorDescription).toBeUndefined()
    assertFailureWasDueToDeployment(failed2, deployment1)
    expect(failed2.reason).toBe(FailureReason.NO_ENTITY_OR_AUDIT)
    expect(failed2.errorDescription).toEqual('description')
  })

  it(`When successful deployment is reported, then all previous failures of such reported are deleted`, async () => {
    const deployment = buildRandomDeployment()

    await reportDeployment({ deployment, reason: FailureReason.DEPLOYMENT_ERROR })

    await repository.run(
      (db) => manager.reportSuccessfulDeployment(db.failedDeployments, deployment.entityType, deployment.entityId),
      { priority: DB_REQUEST_PRIORITY.LOW }
    )

    const status = await getDeploymentStatus(deployment)
    expect(status).toBe(NoFailure.NOT_MARKED_AS_FAILED)
  })

  function assertFailureWasDueToDeployment(failedDeployment: FailedDeployment, deployment: FakeDeployment) {
    expect(failedDeployment.entityId).toEqual(deployment.entityId)
    expect(failedDeployment.entityType).toEqual(deployment.entityType)
  }

  function reportDeployment({
    deployment,
    reason,
    description
  }: {
    deployment: FakeDeployment
    reason: FailureReason
    description?: string
  }): Promise<null> {
    const { entityType, entityId } = deployment
    return repository.run(
      (db) => manager.reportFailure(db.failedDeployments, entityType, entityId, reason, description),
      { priority: DB_REQUEST_PRIORITY.LOW }
    )
  }

  function getDeploymentStatus(deployment: FakeDeployment): Promise<DeploymentStatus> {
    return repository.run(
      (db) => manager.getDeploymentStatus(db.failedDeployments, deployment.entityType, deployment.entityId),
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
