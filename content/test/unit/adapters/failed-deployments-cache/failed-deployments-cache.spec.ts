import { EntityType } from '@dcl/schemas'
import { createTestMetricsComponent } from '@dcl/metrics'
import {
  createFailedDeployments,
  FailureReason,
  IFailedDeploymentsComponent,
  SnapshotFailedDeployment
} from '../../../../src/adapters/failed-deployments-cache'
import { IFailedDeploymentsRepository } from '../../../../src/adapters/failed-deployments-repository'
import { metricsDeclaration } from '../../../../src/metrics'
import { createTestDatabaseComponent } from '../../../mocks/database-component-mock'
import { AppComponents } from '../../../../src/types'

describe('when using the failed-deployments cache adapter', () => {
  let baseDeployment: SnapshotFailedDeployment
  let failedDeploymentsRepository: jest.Mocked<IFailedDeploymentsRepository>
  let cacheComponents: Pick<AppComponents, 'database' | 'metrics' | 'failedDeploymentsRepository'>

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
    failedDeploymentsRepository = {
      saveSnapshotFailedDeployment: jest.fn(),
      deleteFailedDeployment: jest.fn(),
      getSnapshotFailedDeployments: jest.fn().mockResolvedValue([])
    }
    cacheComponents = {
      metrics: createTestMetricsComponent(metricsDeclaration),
      database: createTestDatabaseComponent(),
      failedDeploymentsRepository
    }
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('and the cache is started after the repository returned one persisted deployment', () => {
    let cache: IFailedDeploymentsComponent

    beforeEach(async () => {
      failedDeploymentsRepository.getSnapshotFailedDeployments.mockResolvedValueOnce([baseDeployment])
      cache = await createFailedDeployments(cacheComponents)
      await cache.start()
    })

    it('should expose the persisted deployment via getAllFailedDeployments', async () => {
      const failed = await cache.getAllFailedDeployments()
      expect(failed).toEqual([baseDeployment])
    })

    it('should return the persisted deployment via findFailedDeployment for its entityId', async () => {
      const failed = await cache.findFailedDeployment(baseDeployment.entityId)
      expect(failed).toEqual(baseDeployment)
    })

    it('should return undefined via findFailedDeployment for an unknown entityId', async () => {
      const failed = await cache.findFailedDeployment('unknown-entity-id')
      expect(failed).toBeUndefined()
    })
  })

  describe('and removeFailedDeployment is called for an entity that is in the cache', () => {
    let cache: IFailedDeploymentsComponent

    beforeEach(async () => {
      failedDeploymentsRepository.getSnapshotFailedDeployments.mockResolvedValueOnce([baseDeployment])
      cache = await createFailedDeployments(cacheComponents)
      await cache.start()
      await cache.removeFailedDeployment(baseDeployment.entityId)
    })

    it('should delete the row from the repository using the same database client', () => {
      expect(failedDeploymentsRepository.deleteFailedDeployment).toHaveBeenCalledWith(
        cacheComponents.database,
        baseDeployment.entityId
      )
    })

    it('should remove the deployment from the cache', async () => {
      const failed = await cache.getAllFailedDeployments()
      expect(failed).toHaveLength(0)
    })
  })

  describe('and removeFailedDeployment is called for an entity that is not in the cache', () => {
    let cache: IFailedDeploymentsComponent

    beforeEach(async () => {
      cache = await createFailedDeployments(cacheComponents)
      await cache.start()
      await cache.removeFailedDeployment('not-in-cache')
    })

    it('should not call the repository', () => {
      expect(failedDeploymentsRepository.deleteFailedDeployment).not.toHaveBeenCalled()
    })
  })

  describe('and cacheFailedDeployment is called with a new deployment', () => {
    let cache: IFailedDeploymentsComponent

    beforeEach(async () => {
      cache = await createFailedDeployments(cacheComponents)
      await cache.start()
      await cache.cacheFailedDeployment(baseDeployment)
    })

    it('should not write to the repository (cache adapter is write-through, persistence is the reporter`s job)', () => {
      expect(failedDeploymentsRepository.saveSnapshotFailedDeployment).not.toHaveBeenCalled()
      expect(failedDeploymentsRepository.deleteFailedDeployment).not.toHaveBeenCalled()
    })

    it('should expose the deployment via findFailedDeployment', async () => {
      const failed = await cache.findFailedDeployment(baseDeployment.entityId)
      expect(failed).toEqual(baseDeployment)
    })
  })

  describe('and the cache is warmed with many persisted deployments', () => {
    let cache: IFailedDeploymentsComponent
    let warmedDeployments: SnapshotFailedDeployment[]
    let warmedCount: number

    beforeEach(async () => {
      warmedCount = 250
      warmedDeployments = Array.from({ length: warmedCount }, (_, i) => ({
        ...baseDeployment,
        entityId: `entity-${i}`,
        snapshotHash: `snapshot-${i}`
      }))
      failedDeploymentsRepository.getSnapshotFailedDeployments.mockResolvedValueOnce(warmedDeployments)
      cache = await createFailedDeployments(cacheComponents)
      await cache.start()
    })

    it('should enumerate every warmed deployment via getAllFailedDeployments (no implicit ttl/lru eviction)', async () => {
      const failed = await cache.getAllFailedDeployments()
      expect(failed).toHaveLength(warmedCount)
    })
  })
})
