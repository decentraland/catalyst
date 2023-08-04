import { EntityType } from '@dcl/schemas'
import { saveSnapshotFailedDeployment } from '../../../src/logic/database-queries/failed-deployments-queries'
import {
  createFailedDeployments,
  FailedDeployment,
  FailureReason,
  IFailedDeploymentsComponent,
  SnapshotFailedDeployment
} from '../../../src/ports/failedDeployments'
import { TestProgram } from '../TestProgram'
import { createDefaultServer, resetServer } from '../simpleTestEnvironment'

describe('failed deployments - ', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
  })

  beforeEach(() => resetServer(server))

  afterAll(async () => {
    vi.restoreAllMocks()
  })

  const aFailedDeployment = {
    entityType: EntityType.PROFILE,
    entityId: 'id',
    failureTimestamp: 123,
    reason: FailureReason.DEPLOYMENT_ERROR,
    authChain: [],
    errorDescription: 'some-error',
    snapshotHash: 'someHash'
  }

  it('should return no failed deployments after start if there no one in the db', async () => {
    const failedDeployments = await startComponentsWithBaseFailedDeployments([])
    const failedDeps = await failedDeployments.getAllFailedDeployments()
    expect(failedDeps).toHaveLength(0)
  })

  it('should return all failed deployments from db after start', async () => {
    const failedDeployments = await startComponentsWithBaseFailedDeployments([aFailedDeployment])
    const failedDeps = await failedDeployments.getAllFailedDeployments()
    expect(failedDeps).toEqual(expect.arrayContaining([aFailedDeployment]))
  })

  it('should find failed deploymenet by entity id after start', async () => {
    const failedDeployments = await startComponentsWithBaseFailedDeployments([aFailedDeployment])
    const failedDep = await failedDeployments.findFailedDeployment(aFailedDeployment.entityId)
    expect(failedDep).toEqual(aFailedDeployment)
  })

  it('should remove failed deployment', async () => {
    const failedDeployments = await startComponentsWithBaseFailedDeployments([aFailedDeployment])
    await failedDeployments.removeFailedDeployment(aFailedDeployment.entityId)
    await restartFailedDeploymentsAndAssertStoredDeployments(failedDeployments, [])
  })

  it('should report failure when there wasn`t a failed deployment with the same entity id', async () => {
    const failedDeployments = await startComponentsWithBaseFailedDeployments([aFailedDeployment])
    const newFailedDeployment = { ...aFailedDeployment, entityId: 'anotherId' }

    await failedDeployments.reportFailure(newFailedDeployment)

    await restartFailedDeploymentsAndAssertStoredDeployments(failedDeployments, [
      aFailedDeployment,
      newFailedDeployment
    ])
  })

  it('should report failed deployment and delete the previous one if there was one with the same entity id', async () => {
    const failedDeployments = await startComponentsWithBaseFailedDeployments([aFailedDeployment])
    const newFailedDeploymentWithSameId = {
      ...aFailedDeployment,
      failureTimestamp: aFailedDeployment.failureTimestamp + 10
    }

    await failedDeployments.reportFailure(newFailedDeploymentWithSameId)

    await restartFailedDeploymentsAndAssertStoredDeployments(failedDeployments, [newFailedDeploymentWithSameId])
  })

  async function startComponentsWithBaseFailedDeployments(baseFailedDeployments: SnapshotFailedDeployment[]) {
    await server.components.database.transaction(async (db) => {
      for (const failedDeployment of baseFailedDeployments) {
        await saveSnapshotFailedDeployment(db, failedDeployment)
      }
    })

    const failedDeployments = await createFailedDeployments(server.components)
    await failedDeployments.start()
    return failedDeployments
  }

  /**
   * The failed deployments component is restarted so we can test that they are stored in database and not only in cache.
   */
  async function restartFailedDeploymentsAndAssertStoredDeployments(
    failedDeployments: IFailedDeploymentsComponent,
    storedFailedDeployments: FailedDeployment[]
  ) {
    const failedDeps = await failedDeployments.getAllFailedDeployments()
    expect(failedDeps).toEqual(expect.arrayContaining(storedFailedDeployments))
  }
})
