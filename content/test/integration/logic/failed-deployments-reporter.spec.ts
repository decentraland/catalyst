import { EntityType } from '@dcl/schemas'
import LeakDetector from 'jest-leak-detector'
import {
  createFailedDeployments,
  FailureReason,
  IFailedDeploymentsComponent,
  SnapshotFailedDeployment
} from '../../../src/adapters/failed-deployments'
import { TestProgram } from '../TestProgram'
import { createDefaultServer, resetServer } from '../simpleTestEnvironment'

describe('when reporting a failure end-to-end against a real database', () => {
  let server: TestProgram
  let baseDeployment: SnapshotFailedDeployment

  beforeAll(async () => {
    server = await createDefaultServer()
  })

  beforeEach(async () => {
    baseDeployment = {
      entityType: EntityType.PROFILE,
      entityId: 'id',
      failureTimestamp: 123,
      reason: FailureReason.DEPLOYMENT_ERROR,
      authChain: [],
      errorDescription: 'some-error',
      snapshotHash: 'someHash'
    }
    await resetServer(server)
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

  describe('and the snapshot deployment has not been seen before', () => {
    let reReadCache: IFailedDeploymentsComponent
    let newDeployment: SnapshotFailedDeployment

    beforeEach(async () => {
      newDeployment = { ...baseDeployment, entityId: 'fresh-entity' }
      const cache = await startCacheWith(server, [baseDeployment])
      await cache.reportFailure(newDeployment)
      reReadCache = await startCacheWith(server, [])
    })

    it('should persist the new deployment so a fresh cache reload sees both rows', async () => {
      const failed = await reReadCache.getAllFailedDeployments()
      expect(failed).toEqual(expect.arrayContaining([baseDeployment, newDeployment]))
    })
  })

  describe('and the snapshot deployment is being re-reported with a new failure timestamp', () => {
    let reReadCache: IFailedDeploymentsComponent
    let updatedDeployment: SnapshotFailedDeployment

    beforeEach(async () => {
      updatedDeployment = { ...baseDeployment, failureTimestamp: baseDeployment.failureTimestamp + 10 }
      const cache = await startCacheWith(server, [baseDeployment])
      await cache.reportFailure(updatedDeployment)
      reReadCache = await startCacheWith(server, [])
    })

    it('should leave a single row in the database with the updated failure timestamp', async () => {
      const failed = await reReadCache.getAllFailedDeployments()
      expect(failed).toHaveLength(1)
      expect(failed[0]).toEqual(updatedDeployment)
    })
  })
})

async function startCacheWith(
  server: TestProgram,
  base: SnapshotFailedDeployment[]
): Promise<IFailedDeploymentsComponent> {
  await server.components.database.transaction(async (db) => {
    for (const deployment of base) {
      await server.components.failedDeployments.saveSnapshotFailedDeployment(db, deployment)
    }
  })
  const cache = await createFailedDeployments(server.components)
  await cache.start()
  return cache
}
