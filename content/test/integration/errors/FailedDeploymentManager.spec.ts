import {
  DeploymentStatus,
  FailedDeployment,
  FailedDeploymentsManager,
  FailureReason,
  NoFailure
} from '@katalyst/content/service/errors/FailedDeploymentsManager'
import { Repository } from '@katalyst/content/storage/Repository'
import { RepositoryFactory } from '@katalyst/content/storage/RepositoryFactory'
import { EntityId, EntityType, ServerAddress, Timestamp } from 'dcl-catalyst-commons'
import { internet, random } from 'faker'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'

describe('Integration - Failed Deployments Manager', function () {
  const testEnv = loadStandaloneTestEnvironment()
  const manager = new FailedDeploymentsManager()
  let repository: Repository

  beforeEach(async () => {
    const env = await testEnv.getEnvForNewDatabase()
    repository = await RepositoryFactory.create(env)
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

    const [failed1, failed2]: Array<FailedDeployment> = await repository.run((db) =>
      manager.getAllFailedDeployments(db.failedDeployments)
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

    await repository.run((db) =>
      manager.reportSuccessfulDeployment(db.failedDeployments, deployment.entityType, deployment.entityId)
    )

    const status = await getDeploymentStatus(deployment)
    expect(status).toBe(NoFailure.NOT_MARKED_AS_FAILED)
  })

  function assertFailureWasDueToDeployment(failedDeployment: FailedDeployment, deployment: FakeDeployment) {
    expect(failedDeployment.entityId).toEqual(deployment.entityId)
    expect(failedDeployment.entityType).toEqual(deployment.entityType)
    expect(failedDeployment.originServerUrl).toEqual(deployment.originServerUrl)
    expect(failedDeployment.originTimestamp).toEqual(deployment.originTimestamp)
    expect(failedDeployment.failureTimestamp).toBeGreaterThanOrEqual(deployment.originTimestamp)
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
    const { entityType, entityId, originTimestamp, originServerUrl } = deployment
    return repository.run((db) =>
      manager.reportFailure(
        db.failedDeployments,
        entityType,
        entityId,
        originTimestamp,
        originServerUrl,
        reason,
        description
      )
    )
  }

  function getDeploymentStatus(deployment: FakeDeployment): Promise<DeploymentStatus> {
    return repository.run((db) =>
      manager.getDeploymentStatus(db.failedDeployments, deployment.entityType, deployment.entityId)
    )
  }

  function buildRandomDeployment(): FakeDeployment {
    const originTimestamp = Date.now()
    const originServerUrl = internet.url()
    const event = {
      entityType: EntityType.PROFILE,
      entityId: random.alphaNumeric(10),
      originTimestamp,
      originServerUrl
    }
    return event
  }
})

type FakeDeployment = {
  entityType: EntityType
  entityId: EntityId
  originTimestamp: Timestamp
  originServerUrl: ServerAddress
}
