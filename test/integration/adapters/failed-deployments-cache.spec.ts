import { EntityType } from '@dcl/schemas'
import LeakDetector from 'jest-leak-detector'
import {
  createFailedDeployments,
  FailedDeployment,
  FailureReason,
  IFailedDeploymentsComponent,
  SnapshotFailedDeployment
} from '../../../src/adapters/failed-deployments'
import { TestProgram } from '../TestProgram'
import { createDefaultServer, resetServer } from '../simpleTestEnvironment'

const MIN_RETRY_COUNT = 10

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
      expect(failed).toEqual(expect.arrayContaining([expect.objectContaining(baseDeployment)]))
    })

    it('should return the persisted deployment via findFailedDeployment for its entityId', async () => {
      const failed = await cache.findFailedDeployment(baseDeployment.entityId)
      expect(failed).toEqual(expect.objectContaining(baseDeployment))
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

  describe('and starting with several rows persisted', () => {
    let cache: IFailedDeploymentsComponent
    let persistedDeployments: SnapshotFailedDeployment[]

    beforeEach(async () => {
      persistedDeployments = ['id-a', 'id-b', 'id-c'].map((entityId) => ({
        ...baseDeployment,
        entityId,
        snapshotHash: `hash-${entityId}`,
        retryCount: MIN_RETRY_COUNT
      }))
      cache = await startCacheWith(server, persistedDeployments)
    })

    describe('and removeExhaustedFailedDeployments is called for a subset of them', () => {
      let persistedAfterRemoval: FailedDeployment[]
      let cachedAfterRemoval: FailedDeployment[]

      beforeEach(async () => {
        await cache.removeExhaustedFailedDeployments(['id-a', 'id-c'], MIN_RETRY_COUNT)
        cachedAfterRemoval = await cache.getAllFailedDeployments()
        persistedAfterRemoval = await (await startCacheWith(server, [])).getAllFailedDeployments()
      })

      it('should delete only those rows from the database', () => {
        expect(persistedAfterRemoval).toEqual([expect.objectContaining({ entityId: 'id-b' })])
      })

      it('should evict only those entities from the in-memory cache', () => {
        expect(cachedAfterRemoval).toEqual([expect.objectContaining({ entityId: 'id-b' })])
      })
    })

    describe('and removeExhaustedFailedDeployments is called for every one of them', () => {
      let persistedAfterRemoval: FailedDeployment[]

      beforeEach(async () => {
        await cache.removeExhaustedFailedDeployments(
          persistedDeployments.map(({ entityId }) => entityId),
          MIN_RETRY_COUNT
        )
        persistedAfterRemoval = await (await startCacheWith(server, [])).getAllFailedDeployments()
      })

      it('should leave no rows behind in the database', () => {
        expect(persistedAfterRemoval).toHaveLength(0)
      })
    })

    describe('and one of them failed afresh with a lower retry count before the removal ran', () => {
      let persistedAfterRemoval: FailedDeployment[]
      let cachedAfterRemoval: FailedDeployment[]

      beforeEach(async () => {
        // The real sequence behind a reset count: the entity deploys, which clears its row, and only
        // then fails again. A plain re-report cannot lower it — the upsert clamps with GREATEST.
        await cache.removeFailedDeployment('id-b')
        await cache.reportFailure({ ...baseDeployment, entityId: 'id-b', snapshotHash: 'hash-id-b', retryCount: 0 })
        await cache.removeExhaustedFailedDeployments(['id-a', 'id-b', 'id-c'], MIN_RETRY_COUNT)
        cachedAfterRemoval = await cache.getAllFailedDeployments()
        persistedAfterRemoval = await (await startCacheWith(server, [])).getAllFailedDeployments()
      })

      it('should leave the re-reported row in the database', () => {
        expect(persistedAfterRemoval).toEqual([expect.objectContaining({ entityId: 'id-b' })])
      })

      it('should keep the re-reported entity in the cache, so it stays retryable', () => {
        expect(cachedAfterRemoval).toEqual([expect.objectContaining({ entityId: 'id-b' })])
      })
    })

    describe('and removeExhaustedFailedDeployments is called with entity ids that were never persisted', () => {
      let persistedAfterRemoval: FailedDeployment[]

      beforeEach(async () => {
        await cache.removeExhaustedFailedDeployments(['unknown-a', 'unknown-b'], MIN_RETRY_COUNT)
        persistedAfterRemoval = await (await startCacheWith(server, [])).getAllFailedDeployments()
      })

      it('should leave every persisted row untouched', () => {
        expect(persistedAfterRemoval).toHaveLength(3)
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
      await server.components.failedDeployments.saveSnapshotFailedDeployment(db, deployment)
    }
  })
  const cache = await createFailedDeployments(server.components)
  await cache.start()
  return cache
}
