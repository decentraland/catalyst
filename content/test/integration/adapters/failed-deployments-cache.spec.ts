import { EntityType } from '@dcl/schemas'
import LeakDetector from 'jest-leak-detector'
import { saveSnapshotFailedDeployment } from '../../../src/adapters/failed-deployments-repository'
import {
  createFailedDeployments,
  FailureReason,
  IFailedDeploymentsComponent,
  SnapshotFailedDeployment
} from '../../../src/adapters/failed-deployments-cache'
import { TestProgram } from '../TestProgram'
import { createDefaultServer, resetServer } from '../simpleTestEnvironment'

describe('when using the failed-deployments cache adapter against a real database', () => {
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

  describe('and starting with no rows persisted', () => {
    let cache: IFailedDeploymentsComponent

    beforeEach(async () => {
      cache = await startCacheWith(server, [])
    })

    it('should return an empty list from getAllFailedDeployments', async () => {
      const failed = await cache.getAllFailedDeployments()
      expect(failed).toHaveLength(0)
    })
  })

  describe('and starting with one row persisted', () => {
    let cache: IFailedDeploymentsComponent

    beforeEach(async () => {
      cache = await startCacheWith(server, [baseDeployment])
    })

    it('should warm the cache with the persisted deployment', async () => {
      const failed = await cache.getAllFailedDeployments()
      expect(failed).toEqual(expect.arrayContaining([baseDeployment]))
    })

    it('should return the persisted deployment via findFailedDeployment for its entityId', async () => {
      const failed = await cache.findFailedDeployment(baseDeployment.entityId)
      expect(failed).toEqual(baseDeployment)
    })

    describe('and removeFailedDeployment is called for the persisted entity', () => {
      beforeEach(async () => {
        await cache.removeFailedDeployment(baseDeployment.entityId)
      })

      it('should drop the row in a fresh cache instance loaded from the database', async () => {
        const reloaded = await startCacheWith(server, [])
        const failed = await reloaded.getAllFailedDeployments()
        expect(failed).toHaveLength(0)
      })
    })
  })
})

async function startCacheWith(
  server: TestProgram,
  base: SnapshotFailedDeployment[]
): Promise<IFailedDeploymentsComponent> {
  await server.components.database.transaction(async (db) => {
    for (const deployment of base) {
      await saveSnapshotFailedDeployment(db, deployment)
    }
  })
  const cache = await createFailedDeployments(server.components)
  await cache.start()
  return cache
}
