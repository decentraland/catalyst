import { EntityType } from '@dcl/schemas'
import { createTestMetricsComponent } from '@dcl/metrics'
import {
  createFailedDeployments,
  FailureReason,
  IFailedDeploymentsComponent,
  SnapshotFailedDeployment
} from '../../../../src/adapters/failed-deployments'
import { IDatabaseComponent } from '../../../../src/adapters/database'
import { FailedDeployment } from '../../../../src/adapters/failed-deployments'
import { metricsDeclaration } from '../../../../src/metrics'
import { createDatabaseMockedComponent } from '../../../mocks/database-component-mock'

const MIN_RETRY_COUNT = 10
const FIRST_REPORT = { retryCount: 5, nextRetryAt: 5_000_000_000_000 }
const SECOND_REPORT = { retryCount: 6, nextRetryAt: 6_000_000_000_000 }

/** Lets every already-scheduled microtask run before the assertions look at the mocks. */
async function flushPendingJobs(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

/** Shapes a `DELETE ... RETURNING entity_id` result for the ids the guard actually matched. */
function deleteResult(entityIds: string[]) {
  return { rows: entityIds.map((entityId) => ({ entityId })), rowCount: entityIds.length } as any
}

async function readFailedDeploymentsGauge(
  metrics: ReturnType<typeof createTestMetricsComponent>
): Promise<number | undefined> {
  const reported = (await metrics.registry.getMetricsAsJSON()).find(
    ({ name }) => name === 'dcl_content_server_failed_deployments'
  )
  return (reported?.values[0] as { value: number } | undefined)?.value
}

describe('when using the merged failed-deployments adapter', () => {
  let baseDeployment: SnapshotFailedDeployment
  let metrics: ReturnType<typeof createTestMetricsComponent>
  let database: jest.Mocked<IDatabaseComponent>

  beforeEach(() => {
    baseDeployment = {
      entityType: EntityType.PROFILE,
      entityId: 'id',
      failureTimestamp: 123,
      reason: FailureReason.DEPLOYMENT_ERROR,
      authChain: [],
      errorDescription: 'some-error',
      snapshotHash: 'someHash'
    }
    metrics = createTestMetricsComponent(metricsDeclaration)
    database = createDatabaseMockedComponent()
    // Default: no rows persisted on start
    database.queryWithValues.mockResolvedValue({ rows: [], rowCount: 0 } as any)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('and the table contains one persisted deployment at start', () => {
    let adapter: IFailedDeploymentsComponent

    beforeEach(async () => {
      database.queryWithValues.mockResolvedValueOnce({ rows: [baseDeployment], rowCount: 1 } as any)
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
    })

    it('should expose the persisted deployment via getAllFailedDeployments', async () => {
      expect(await adapter.getAllFailedDeployments()).toEqual([baseDeployment])
    })

    it('should return the persisted deployment via findFailedDeployment for its entityId', async () => {
      expect(await adapter.findFailedDeployment(baseDeployment.entityId)).toEqual(baseDeployment)
    })

    it('should return undefined via findFailedDeployment for an unknown entityId', async () => {
      expect(await adapter.findFailedDeployment('unknown-entity-id')).toBeUndefined()
    })
  })

  describe('and saveSnapshotFailedDeployment is called with an explicit db client', () => {
    let adapter: IFailedDeploymentsComponent
    let txClient: jest.Mocked<IDatabaseComponent>

    beforeEach(async () => {
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      txClient = createDatabaseMockedComponent()
      txClient.queryWithValues.mockResolvedValue({ rows: [{ retryCount: 0, nextRetryAt: 0 }], rowCount: 1 } as any)
      await adapter.saveSnapshotFailedDeployment(txClient, baseDeployment)
    })

    it('should issue the INSERT through the supplied db client', () => {
      expect(txClient.queryWithValues).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('INSERT INTO failed_deployments') }),
        'save_failed_deployment'
      )
    })

    it('should NOT touch the in-memory cache (caller does the post-tx cache update via cacheFailedDeployment)', async () => {
      expect(await adapter.findFailedDeployment(baseDeployment.entityId)).toBeUndefined()
    })
  })

  describe('and deleteFailedDeployment is called with an explicit db client', () => {
    let adapter: IFailedDeploymentsComponent
    let txClient: jest.Mocked<IDatabaseComponent>

    beforeEach(async () => {
      database.queryWithValues.mockResolvedValueOnce({ rows: [baseDeployment], rowCount: 1 } as any)
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      txClient = createDatabaseMockedComponent()
      txClient.queryWithValues.mockResolvedValue({ rows: [], rowCount: 0 } as any)
      await adapter.deleteFailedDeployment(txClient, baseDeployment.entityId)
    })

    it('should issue the DELETE through the supplied db client', () => {
      expect(txClient.queryWithValues).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('DELETE FROM failed_deployments') }),
        'delete_failed_deployment'
      )
    })

    it('should NOT touch the in-memory cache (caller drives the cache evict explicitly after the transaction)', async () => {
      expect(await adapter.findFailedDeployment(baseDeployment.entityId)).toEqual(baseDeployment)
    })
  })

  describe('and removeFailedDeployment is called for an entity that is in the cache', () => {
    let adapter: IFailedDeploymentsComponent

    beforeEach(async () => {
      database.queryWithValues.mockResolvedValueOnce({ rows: [baseDeployment], rowCount: 1 } as any)
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()
      await adapter.removeFailedDeployment(baseDeployment.entityId)
    })

    it('should issue the DELETE through the pool db client', () => {
      expect(database.queryWithValues).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('DELETE FROM failed_deployments') }),
        'delete_failed_deployment'
      )
    })

    it('should remove the deployment from the cache', async () => {
      expect(await adapter.getAllFailedDeployments()).toHaveLength(0)
    })
  })

  describe('and removeFailedDeployment is called for an entity that is not in the cache', () => {
    let adapter: IFailedDeploymentsComponent

    beforeEach(async () => {
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()
      await adapter.removeFailedDeployment('not-in-cache')
    })

    it('should not issue any SQL', () => {
      expect(database.queryWithValues).not.toHaveBeenCalled()
    })
  })

  describe('and removeExhaustedFailedDeployments is called for several exhausted entities', () => {
    let adapter: IFailedDeploymentsComponent
    let cachedDeployments: SnapshotFailedDeployment[]
    let reportedGaugeValue: number | undefined

    beforeEach(async () => {
      cachedDeployments = ['entity-a', 'entity-b', 'entity-c'].map((entityId) => ({ ...baseDeployment, entityId }))
      database.queryWithValues.mockResolvedValueOnce({ rows: cachedDeployments, rowCount: 3 } as any)
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()
      database.queryWithValues.mockResolvedValueOnce(deleteResult(['entity-a', 'entity-b', 'entity-c']))
      await adapter.removeExhaustedFailedDeployments(['entity-a', 'entity-b', 'entity-c'], MIN_RETRY_COUNT)
      reportedGaugeValue = await readFailedDeploymentsGauge(metrics)
    })

    it('should issue one batched DELETE rather than a round-trip per entity', () => {
      expect(database.queryWithValues).toHaveBeenCalledTimes(1)
    })

    it('should send every entity id and the retry-count guard in the single statement', () => {
      expect(database.queryWithValues).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('DELETE FROM failed_deployments'),
          values: [['entity-a', 'entity-b', 'entity-c'], MIN_RETRY_COUNT]
        }),
        'delete_failed_deployments'
      )
    })

    it('should guard the statement on the retry count, so a re-reported entry survives', () => {
      expect(database.queryWithValues.mock.calls[0][0].text).toContain('retry_count >=')
    })

    it('should not open a database transaction', () => {
      expect(database.transaction).not.toHaveBeenCalled()
    })

    it('should evict every deleted entity from the cache', async () => {
      expect(await adapter.getAllFailedDeployments()).toEqual([])
    })

    it('should report the emptied cache on the failed-deployments gauge', () => {
      expect(reportedGaugeValue).toBe(0)
    })
  })

  describe('and the database spares an entity whose retry count dropped before the removal ran', () => {
    let adapter: IFailedDeploymentsComponent
    let cachedDeployments: SnapshotFailedDeployment[]

    beforeEach(async () => {
      cachedDeployments = ['entity-a', 'entity-b', 'entity-c'].map((entityId) => ({ ...baseDeployment, entityId }))
      database.queryWithValues.mockResolvedValueOnce({ rows: cachedDeployments, rowCount: 3 } as any)
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()
      // The guard matched only two rows: 'entity-b' was cleared and has failed afresh since.
      database.queryWithValues.mockResolvedValueOnce(deleteResult(['entity-a', 'entity-c']))
      await adapter.removeExhaustedFailedDeployments(['entity-a', 'entity-b', 'entity-c'], MIN_RETRY_COUNT)
    })

    it('should keep the spared entity in the cache, so it stays retryable', async () => {
      expect(await adapter.getAllFailedDeployments()).toEqual([expect.objectContaining({ entityId: 'entity-b' })])
    })
  })

  describe('and a fresh failure for one of the entities is reported while the batched DELETE is in flight', () => {
    let adapter: IFailedDeploymentsComponent
    let cachedDeployments: SnapshotFailedDeployment[]
    let freshReport: Promise<void>
    let insertedRetryCount: number | undefined

    beforeEach(async () => {
      cachedDeployments = ['entity-a', 'entity-b', 'entity-c'].map((entityId) => ({
        ...baseDeployment,
        entityId,
        retryCount: MIN_RETRY_COUNT
      }))
      freshReport = Promise.resolve()
      database.queryWithValues.mockResolvedValueOnce({ rows: cachedDeployments, rowCount: 3 } as any)
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()
      database.queryWithValues
        // The DELETE is in flight when the sync path reports 'entity-b' afresh, without a retry count.
        .mockImplementationOnce(async () => {
          freshReport = adapter.reportFailure({ ...baseDeployment, entityId: 'entity-b', failureTimestamp: 999 })
          await flushPendingJobs()
          return deleteResult(['entity-a', 'entity-b', 'entity-c'])
        })
        // The upsert hands back the count it was given, as GREATEST does for a row that no longer exists.
        .mockImplementationOnce(async (statement) => ({
          rows: [{ retryCount: statement.values[7], nextRetryAt: 0 }],
          rowCount: 1
        }))
      await adapter.removeExhaustedFailedDeployments(['entity-a', 'entity-b', 'entity-c'], MIN_RETRY_COUNT)
      await freshReport
      insertedRetryCount = database.queryWithValues.mock.calls[1]?.[0]?.values[7]
    })

    it('should run the report only after the eviction, so it does not inherit the exhausted count', () => {
      expect(insertedRetryCount).toBe(0)
    })

    it('should end with the fresh entry in the cache rather than evicting it with the old one', async () => {
      expect(await adapter.getAllFailedDeployments()).toEqual([
        expect.objectContaining({ entityId: 'entity-b', retryCount: 0 })
      ])
    })
  })

  describe('and removeExhaustedFailedDeployments is called with the same entity id more than once', () => {
    let adapter: IFailedDeploymentsComponent

    beforeEach(async () => {
      database.queryWithValues.mockResolvedValueOnce({ rows: [baseDeployment], rowCount: 1 } as any)
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()
      database.queryWithValues.mockResolvedValueOnce(deleteResult([baseDeployment.entityId]))
      await adapter.removeExhaustedFailedDeployments(
        [baseDeployment.entityId, baseDeployment.entityId],
        MIN_RETRY_COUNT
      )
    })

    it('should send the entity id a single time', () => {
      expect(database.queryWithValues.mock.calls[0][0].values[0]).toEqual([baseDeployment.entityId])
    })
  })

  describe('and removeExhaustedFailedDeployments is called with entity ids that are not cached', () => {
    let adapter: IFailedDeploymentsComponent

    beforeEach(async () => {
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()
      database.queryWithValues.mockResolvedValueOnce(deleteResult([]))
      await adapter.removeExhaustedFailedDeployments(['not-in-cache'], MIN_RETRY_COUNT)
    })

    it('should still ask the database, so a row the cache never mirrored is still removable', () => {
      expect(database.queryWithValues).toHaveBeenCalledTimes(1)
    })

    it('should leave the cache untouched', async () => {
      expect(await adapter.getAllFailedDeployments()).toEqual([])
    })
  })

  describe('and removeExhaustedFailedDeployments is called with an empty list', () => {
    let adapter: IFailedDeploymentsComponent

    beforeEach(async () => {
      database.queryWithValues.mockResolvedValueOnce({ rows: [baseDeployment], rowCount: 1 } as any)
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()
      await adapter.removeExhaustedFailedDeployments([], MIN_RETRY_COUNT)
    })

    it('should not issue a DELETE with an empty array', () => {
      expect(database.queryWithValues).not.toHaveBeenCalled()
    })
  })

  describe('and removeExhaustedFailedDeployments is called with more entity ids than fit in one batch', () => {
    let adapter: IFailedDeploymentsComponent
    let cachedDeployments: SnapshotFailedDeployment[]
    let entityIds: string[]

    beforeEach(async () => {
      cachedDeployments = Array.from({ length: 1001 }, (_, index) => ({
        ...baseDeployment,
        entityId: `entity-${index}`
      }))
      entityIds = cachedDeployments.map(({ entityId }) => entityId)
      database.queryWithValues.mockResolvedValueOnce({ rows: cachedDeployments, rowCount: 1001 } as any)
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()
      database.queryWithValues.mockResolvedValueOnce(deleteResult(entityIds.slice(0, 1000)))
      database.queryWithValues.mockResolvedValueOnce(deleteResult(entityIds.slice(1000)))
      await adapter.removeExhaustedFailedDeployments(entityIds, MIN_RETRY_COUNT)
    })

    it('should split the deletion into one statement per batch', () => {
      expect(database.queryWithValues).toHaveBeenCalledTimes(2)
    })

    it('should cap the first statement at the batch size', () => {
      expect(database.queryWithValues.mock.calls[0][0].values[0]).toEqual(entityIds.slice(0, 1000))
    })

    it('should send the remainder in the last statement', () => {
      expect(database.queryWithValues.mock.calls[1][0].values[0]).toEqual(entityIds.slice(1000))
    })

    it('should evict every entity from the cache', async () => {
      expect(await adapter.getAllFailedDeployments()).toEqual([])
    })
  })

  describe('and removeExhaustedFailedDeployments is called with exactly one batch worth of entity ids', () => {
    let adapter: IFailedDeploymentsComponent
    let cachedDeployments: SnapshotFailedDeployment[]

    beforeEach(async () => {
      cachedDeployments = Array.from({ length: 1000 }, (_, index) => ({
        ...baseDeployment,
        entityId: `entity-${index}`
      }))
      database.queryWithValues.mockResolvedValueOnce({ rows: cachedDeployments, rowCount: 1000 } as any)
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()
      database.queryWithValues.mockResolvedValueOnce(deleteResult(cachedDeployments.map(({ entityId }) => entityId)))
      await adapter.removeExhaustedFailedDeployments(
        cachedDeployments.map(({ entityId }) => entityId),
        MIN_RETRY_COUNT
      )
    })

    it('should not split it into a second statement', () => {
      expect(database.queryWithValues).toHaveBeenCalledTimes(1)
    })
  })

  describe('and a batched DELETE fails after an earlier batch already committed', () => {
    let adapter: IFailedDeploymentsComponent
    let cachedDeployments: SnapshotFailedDeployment[]
    let entityIds: string[]
    let raisedError: Error | undefined

    beforeEach(async () => {
      cachedDeployments = Array.from({ length: 1001 }, (_, index) => ({
        ...baseDeployment,
        entityId: `entity-${index}`
      }))
      entityIds = cachedDeployments.map(({ entityId }) => entityId)
      database.queryWithValues.mockResolvedValueOnce({ rows: cachedDeployments, rowCount: 1001 } as any)
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()
      database.queryWithValues.mockResolvedValueOnce(deleteResult(entityIds.slice(0, 1000)))
      database.queryWithValues.mockRejectedValueOnce(new Error('connection terminated'))
      raisedError = undefined
      try {
        await adapter.removeExhaustedFailedDeployments(entityIds, MIN_RETRY_COUNT)
      } catch (error) {
        raisedError = error as Error
      }
    })

    it('should surface the database error to the caller', () => {
      expect(raisedError?.message).toBe('connection terminated')
    })

    it('should keep the entities of the failed batch in the cache, so they are retried next cycle', async () => {
      expect(await adapter.getAllFailedDeployments()).toEqual([expect.objectContaining({ entityId: entityIds[1000] })])
    })

    it('should report what actually survived on the failed-deployments gauge', async () => {
      expect(await readFailedDeploymentsGauge(metrics)).toBe(1)
    })
  })

  describe('and cacheFailedDeployment is called with a new deployment', () => {
    let adapter: IFailedDeploymentsComponent

    beforeEach(async () => {
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()
      await adapter.cacheFailedDeployment(baseDeployment)
    })

    it('should not issue any SQL (cache-only escape hatch for non-persisted failures)', () => {
      expect(database.queryWithValues).not.toHaveBeenCalled()
    })

    it('should expose the deployment via findFailedDeployment', async () => {
      expect(await adapter.findFailedDeployment(baseDeployment.entityId)).toEqual(baseDeployment)
    })
  })

  describe('and the table is warmed with many persisted deployments at start', () => {
    let adapter: IFailedDeploymentsComponent
    let warmedDeployments: SnapshotFailedDeployment[]

    beforeEach(async () => {
      warmedDeployments = Array.from({ length: 250 }, (_, i) => ({
        ...baseDeployment,
        entityId: `entity-${i}`,
        snapshotHash: `snapshot-${i}`
      }))
      database.queryWithValues.mockResolvedValueOnce({ rows: warmedDeployments, rowCount: 250 } as any)
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
    })

    it('should enumerate every warmed deployment via getAllFailedDeployments', async () => {
      expect(await adapter.getAllFailedDeployments()).toHaveLength(250)
    })
  })

  describe('and reportFailure is called for a snapshot deployment whose entity is not yet cached', () => {
    let adapter: IFailedDeploymentsComponent

    beforeEach(async () => {
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()
      database.queryWithValues.mockResolvedValueOnce({ rows: [{ retryCount: 0, nextRetryAt: 0 }], rowCount: 1 } as any)
      await adapter.reportFailure(baseDeployment)
    })

    it('should not open a database transaction', () => {
      expect(database.transaction).not.toHaveBeenCalled()
    })

    it('should issue the INSERT through the pool db client', () => {
      expect(database.queryWithValues).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('INSERT INTO failed_deployments') }),
        'save_failed_deployment'
      )
    })

    it('should update the in-memory cache after the SQL insert succeeds', async () => {
      expect(await adapter.findFailedDeployment(baseDeployment.entityId)).toEqual(
        expect.objectContaining(baseDeployment)
      )
    })
  })

  describe('and reportFailure is called for a snapshot deployment whose entity is already cached', () => {
    let adapter: IFailedDeploymentsComponent
    let reReportedDeployment: SnapshotFailedDeployment

    beforeEach(async () => {
      reReportedDeployment = { ...baseDeployment, failureTimestamp: 999 }
      database.queryWithValues.mockResolvedValueOnce({ rows: [baseDeployment], rowCount: 1 } as any)
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()
      database.queryWithValues.mockResolvedValueOnce({ rows: [{ retryCount: 0, nextRetryAt: 0 }], rowCount: 1 } as any)
      await adapter.reportFailure(reReportedDeployment)
    })

    it('should not open a database transaction', () => {
      expect(database.transaction).not.toHaveBeenCalled()
    })

    it('should re-report through a single idempotent upsert on the pool db client', () => {
      expect(database.queryWithValues).toHaveBeenCalledTimes(1)
      expect(database.queryWithValues).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('ON CONFLICT (entity_id) DO UPDATE') }),
        'save_failed_deployment'
      )
    })

    it('should update the in-memory cache after the SQL upsert succeeds', async () => {
      expect(await adapter.findFailedDeployment(reReportedDeployment.entityId)).toEqual(
        expect.objectContaining(reReportedDeployment)
      )
    })
  })

  describe('and reportFailure is called for a non-snapshot deployment', () => {
    let adapter: IFailedDeploymentsComponent
    let nonSnapshotDeployment: FailedDeployment

    beforeEach(async () => {
      nonSnapshotDeployment = {
        entityType: EntityType.PROFILE,
        entityId: 'no-snapshot-entity',
        failureTimestamp: 123,
        reason: FailureReason.DEPLOYMENT_ERROR,
        authChain: [],
        errorDescription: 'some-error'
      }
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()
      await adapter.reportFailure(nonSnapshotDeployment)
    })

    it('should not open a database transaction', () => {
      expect(database.transaction).not.toHaveBeenCalled()
    })

    it('should not issue any SQL (non-snapshot failures are not persisted)', () => {
      expect(database.queryWithValues).not.toHaveBeenCalled()
    })

    it('should write through to the in-memory cache', async () => {
      expect(await adapter.findFailedDeployment(nonSnapshotDeployment.entityId)).toEqual(
        expect.objectContaining(nonSnapshotDeployment)
      )
    })
  })

  describe('and reportFailure is called without retry fields for an entity that already has backoff state', () => {
    let adapter: IFailedDeploymentsComponent
    const existingDeployment: SnapshotFailedDeployment = {
      entityType: EntityType.PROFILE,
      entityId: 'backed-off-entity',
      failureTimestamp: 100,
      reason: FailureReason.DEPLOYMENT_ERROR,
      authChain: [],
      errorDescription: 'first-error',
      snapshotHash: 'hash1',
      retryCount: 5,
      nextRetryAt: 9999999999999
    }

    beforeEach(async () => {
      database.queryWithValues.mockResolvedValueOnce({ rows: [existingDeployment], rowCount: 1 } as any)
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()
      database.queryWithValues.mockResolvedValueOnce({
        rows: [{ retryCount: 5, nextRetryAt: 9999999999999 }],
        rowCount: 1
      } as any)
      await adapter.reportFailure({
        ...existingDeployment,
        errorDescription: 'new-error-from-sync',
        retryCount: undefined,
        nextRetryAt: undefined
      })
    })

    it('should preserve the existing retryCount and nextRetryAt', async () => {
      const cached = await adapter.findFailedDeployment(existingDeployment.entityId)
      expect(cached?.retryCount).toBe(5)
      expect(cached?.nextRetryAt).toBe(9999999999999)
      expect(cached?.errorDescription).toBe('new-error-from-sync')
    })
  })

  describe('and reportFailure is called with explicit retry fields', () => {
    let adapter: IFailedDeploymentsComponent

    beforeEach(async () => {
      database.queryWithValues.mockResolvedValueOnce({ rows: [baseDeployment], rowCount: 1 } as any)
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()
      database.queryWithValues.mockResolvedValueOnce({
        rows: [{ retryCount: 3, nextRetryAt: 5000000000000 }],
        rowCount: 1
      } as any)
      await adapter.reportFailure({
        ...baseDeployment,
        retryCount: 3,
        nextRetryAt: 5000000000000
      })
    })

    it('should use the provided retry fields', async () => {
      const cached = await adapter.findFailedDeployment(baseDeployment.entityId)
      expect(cached?.retryCount).toBe(3)
      expect(cached?.nextRetryAt).toBe(5000000000000)
    })
  })

  describe('and two reportFailure calls for the same entity overlap', () => {
    let adapter: IFailedDeploymentsComponent
    let upsertsIssuedWhileFirstInFlight: number

    beforeEach(async () => {
      database.queryWithValues.mockResolvedValueOnce({ rows: [baseDeployment], rowCount: 1 } as any)
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()

      let releaseFirst: () => void = () => undefined
      const firstInFlight = new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      database.queryWithValues
        .mockImplementationOnce(async () => {
          await firstInFlight
          return { rows: [FIRST_REPORT], rowCount: 1 } as any
        })
        .mockResolvedValueOnce({ rows: [SECOND_REPORT], rowCount: 1 } as any)

      const firstReport = adapter.reportFailure({ ...baseDeployment, ...FIRST_REPORT })
      const secondReport = adapter.reportFailure({ ...baseDeployment, ...SECOND_REPORT })
      await flushPendingJobs()
      upsertsIssuedWhileFirstInFlight = database.queryWithValues.mock.calls.length
      releaseFirst()
      await Promise.all([firstReport, secondReport])
    })

    it('should not issue the second upsert while the first is still in flight', () => {
      expect(upsertsIssuedWhileFirstInFlight).toBe(1)
    })

    it('should end with the second report values in the cache', async () => {
      expect(await adapter.findFailedDeployment(baseDeployment.entityId)).toEqual(
        expect.objectContaining(SECOND_REPORT)
      )
    })

    it('should match what a fresh adapter reloads from the database', async () => {
      const reloadDatabase = createDatabaseMockedComponent()
      reloadDatabase.queryWithValues.mockResolvedValueOnce({
        rows: [{ ...baseDeployment, ...SECOND_REPORT }],
        rowCount: 1
      } as any)
      const reloaded = await createFailedDeployments({ metrics, database: reloadDatabase })
      await reloaded.start()

      const fromDb = await reloaded.findFailedDeployment(baseDeployment.entityId)
      const fromCache = await adapter.findFailedDeployment(baseDeployment.entityId)
      expect(fromCache?.retryCount).toBe(fromDb?.retryCount)
      expect(fromCache?.nextRetryAt).toBe(fromDb?.nextRetryAt)
    })
  })

  describe('and removeFailedDeployment is called while a reportFailure for the same entity is in flight', () => {
    let adapter: IFailedDeploymentsComponent
    let deletesIssuedWhileReportInFlight: number

    beforeEach(async () => {
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      database.queryWithValues.mockClear()

      let releaseReport: () => void = () => undefined
      const reportInFlight = new Promise<void>((resolve) => {
        releaseReport = resolve
      })
      database.queryWithValues
        .mockImplementationOnce(async () => {
          await reportInFlight
          return { rows: [{ retryCount: 0, nextRetryAt: 0 }], rowCount: 1 } as any
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)

      const report = adapter.reportFailure(baseDeployment)
      const removal = adapter.removeFailedDeployment(baseDeployment.entityId)
      await flushPendingJobs()
      deletesIssuedWhileReportInFlight = database.queryWithValues.mock.calls.filter(
        ([, label]) => label === 'delete_failed_deployment'
      ).length
      releaseReport()
      await Promise.all([report, removal])
    })

    it('should not issue the DELETE while the report is still in flight', () => {
      expect(deletesIssuedWhileReportInFlight).toBe(0)
    })

    it('should delete the row the report wrote instead of missing it on a stale cache check', () => {
      expect(database.queryWithValues).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('DELETE FROM failed_deployments') }),
        'delete_failed_deployment'
      )
    })

    it('should leave the cache empty', async () => {
      expect(await adapter.getAllFailedDeployments()).toEqual([])
    })
  })
})
