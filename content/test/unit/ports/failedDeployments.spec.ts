
import { EntityType } from '@dcl/schemas'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import * as failedDeploymentQueries from '../../../src/logic/database-queries/failed-deployments-queries'
import { metricsDeclaration } from '../../../src/metrics'
import { createFailedDeployments, FailedDeployment, FailureReason } from '../../../src/ports/failedDeployments'
import { createTestDatabaseComponent } from '../../../src/ports/postgres'
import { AppComponents } from '../../../src/types'


describe('failed deployments', () => {

  const metrics = createTestMetricsComponent(metricsDeclaration)
  const database = createTestDatabaseComponent()
  const aFailedDeployment = {
    entityType: EntityType.PROFILE,
    entityId: 'id',
    failureTimestamp: 123,
    reason: FailureReason.DEPLOYMENT_ERROR,
    authChain: [],
    errorDescription: 'some-error'
  }

  beforeEach(() => jest.restoreAllMocks())

  it('should return all failed deployments from db after start', async () => {
    const failedDeployments = await createAndStartFailedDeploymentsWith({ metrics, database }, [aFailedDeployment])

    const failed = await failedDeployments.getAllFailedDeployments()

    expect(failed[0]).toEqual(aFailedDeployment)
  })

  it('should find failed deploymenet by entity id after start', async () => {
    const failedDeployments = await createAndStartFailedDeploymentsWith({ metrics, database }, [aFailedDeployment])

    const failed = await failedDeployments.findFailedDeployment(aFailedDeployment.entityId)
    const notFailed = await failedDeployments.findFailedDeployment('anotherId')

    expect(failed).toEqual(aFailedDeployment)
    expect(notFailed).toBeUndefined()
  })

  it('should remove failed deployment', async () => {
    let failedDeploymentsMock = [aFailedDeployment]
    const failedDeployments = await createAndStartFailedDeploymentsWith({ metrics, database }, failedDeploymentsMock)
    jest.spyOn(failedDeploymentQueries, 'deleteFailedDeployment').mockImplementation(async (components, entityId) => {
      failedDeploymentsMock = failedDeploymentsMock.filter(f => f.entityId != entityId)
    })

    await failedDeployments.removeFailedDeployment(aFailedDeployment.entityId)

    const failed = await failedDeployments.getAllFailedDeployments()
    expect(failed).toHaveLength(0)
  })

  it('should report failure when there wasn`t a failed deployment with the same entity id', async () => {
    const saveSpy = jest.spyOn(failedDeploymentQueries, 'saveFailedDeployment').mockImplementation()
    const components = { metrics, database }
    const failedDeployments = await createAndStartFailedDeploymentsWith(components, [aFailedDeployment])
    const newFailedDeployment = { ...aFailedDeployment, entityId: 'anotherId' }

    await failedDeployments.reportFailure(newFailedDeployment)

    const failed = await failedDeployments.getAllFailedDeployments()
    expect(failed).toEqual(expect.arrayContaining([aFailedDeployment, newFailedDeployment]))
    expect(saveSpy).toHaveBeenCalledWith(components, newFailedDeployment)
  })

  it('should report failed deployment and delete the previous one if there was one with the same entity id', async () => {
    const saveSpy = jest.spyOn(failedDeploymentQueries, 'saveFailedDeployment').mockImplementation()
    const deleteSpy = jest.spyOn(failedDeploymentQueries, 'deleteFailedDeployment').mockImplementation()
    const txSpy = jest.spyOn(database, 'transaction').mockImplementation(async (fnToRun) => await fnToRun(database))
    const components = { metrics, database }
    const failedDeployments = await createAndStartFailedDeploymentsWith(components, [aFailedDeployment])
    const newFailedDeploymentWithSameId = {
      ...aFailedDeployment,
      failureTimestamp: aFailedDeployment.failureTimestamp + 10
    }

    await failedDeployments.reportFailure(newFailedDeploymentWithSameId)

    const failed = await failedDeployments.getAllFailedDeployments()
    expect(failed).toHaveLength(1)
    expect(failed[0]).toEqual(newFailedDeploymentWithSameId)
    expect(failed[0].failureTimestamp).toEqual(aFailedDeployment.failureTimestamp + 10)
    expect(saveSpy).toHaveBeenCalledWith({ database }, newFailedDeploymentWithSameId)
    expect(deleteSpy).toHaveBeenCalledWith({ database }, aFailedDeployment.entityId)
    expect(txSpy).toHaveBeenCalled()
  })
})

async function createAndStartFailedDeploymentsWith(
  components: Pick<AppComponents, 'database' | 'metrics'>,
  baseFailedDeployments: FailedDeployment[]) {
  jest.spyOn(failedDeploymentQueries, 'getFailedDeployments').mockResolvedValue(baseFailedDeployments)
  const failedDeployments = await createFailedDeployments(components)
  await failedDeployments.start()
  return failedDeployments
}
