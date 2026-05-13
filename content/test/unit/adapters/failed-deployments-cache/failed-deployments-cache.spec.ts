import { EntityType } from '@dcl/schemas'
import { createTestMetricsComponent } from '@dcl/metrics'
import {
  createFailedDeployments,
  FailureReason,
  IFailedDeploymentsComponent,
  SnapshotFailedDeployment
} from '../../../../src/adapters/failed-deployments'
import { DatabaseTransactionalClient, IDatabaseComponent } from '../../../../src/adapters/database'
import { FailedDeployment } from '../../../../src/adapters/failed-deployments'
import { metricsDeclaration } from '../../../../src/metrics'
import { createDatabaseMockedComponent } from '../../../mocks/database-component-mock'

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
      txClient.queryWithValues.mockResolvedValue({ rows: [], rowCount: 0 } as any)
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
      expect(await adapter.findFailedDeployment(baseDeployment.entityId)).toEqual(baseDeployment)
    })
  })

  describe('and reportFailure is called for a snapshot deployment whose entity is already cached', () => {
    let adapter: IFailedDeploymentsComponent
    let txClient: jest.Mocked<IDatabaseComponent>
    let reReportedDeployment: SnapshotFailedDeployment

    beforeEach(async () => {
      reReportedDeployment = { ...baseDeployment, failureTimestamp: 999 }
      database.queryWithValues.mockResolvedValueOnce({ rows: [baseDeployment], rowCount: 1 } as any)
      adapter = await createFailedDeployments({ metrics, database })
      await adapter.start()
      txClient = createDatabaseMockedComponent()
      txClient.queryWithValues.mockResolvedValue({ rows: [], rowCount: 0 } as any)
      database.transaction.mockImplementation((fn) => fn(txClient as unknown as DatabaseTransactionalClient))
      database.queryWithValues.mockClear()
      await adapter.reportFailure(reReportedDeployment)
    })

    it('should open a single database transaction', () => {
      expect(database.transaction).toHaveBeenCalledTimes(1)
    })

    it('should issue both the DELETE and the INSERT through the transactional client', () => {
      expect(txClient.queryWithValues).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('DELETE FROM failed_deployments') }),
        'delete_failed_deployment'
      )
      expect(txClient.queryWithValues).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('INSERT INTO failed_deployments') }),
        'save_failed_deployment'
      )
    })

    it('should update the in-memory cache only after the transaction has committed', async () => {
      expect(await adapter.findFailedDeployment(reReportedDeployment.entityId)).toEqual(reReportedDeployment)
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
      expect(await adapter.findFailedDeployment(nonSnapshotDeployment.entityId)).toEqual(nonSnapshotDeployment)
    })
  })
})
