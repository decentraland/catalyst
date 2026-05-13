import { EntityType } from '@dcl/schemas'
import {
  FailedDeployment,
  FailureReason,
  IFailedDeploymentsComponent,
  SnapshotFailedDeployment
} from '../../../../src/adapters/failed-deployments'
import { DatabaseTransactionalClient, IDatabaseComponent } from '../../../../src/adapters/database'
import { createFailedDeploymentsReporter } from '../../../../src/logic/failed-deployments-reporter'
import { createDatabaseMockedComponent } from '../../../mocks/database-component-mock'

describe('when the reporter is asked to report a failure', () => {
  let database: jest.Mocked<IDatabaseComponent>
  let failedDeployments: jest.Mocked<IFailedDeploymentsComponent>
  let baseSnapshotDeployment: SnapshotFailedDeployment

  beforeEach(() => {
    database = createDatabaseMockedComponent()
    failedDeployments = {
      start: jest.fn(),
      getAllFailedDeployments: jest.fn(),
      findFailedDeployment: jest.fn(),
      saveSnapshotFailedDeployment: jest.fn(),
      deleteFailedDeployment: jest.fn(),
      cacheFailedDeployment: jest.fn(),
      removeFailedDeployment: jest.fn()
    }
    baseSnapshotDeployment = {
      entityType: EntityType.PROFILE,
      entityId: 'entity-id',
      failureTimestamp: 123,
      reason: FailureReason.DEPLOYMENT_ERROR,
      authChain: [],
      errorDescription: 'some-error',
      snapshotHash: 'snapshot-hash'
    }
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('and the deployment is from a snapshot', () => {
    describe('and the same entity is already cached as failed', () => {
      let txClient: DatabaseTransactionalClient
      let reReportedDeployment: SnapshotFailedDeployment

      beforeEach(async () => {
        reReportedDeployment = { ...baseSnapshotDeployment, failureTimestamp: 999 }
        failedDeployments.findFailedDeployment.mockResolvedValueOnce(baseSnapshotDeployment)
        txClient = { insideTx: true, ...database } as DatabaseTransactionalClient
        database.transaction.mockImplementation((fn) => fn(txClient))

        const reporter = createFailedDeploymentsReporter({ database, failedDeployments })
        await reporter.reportFailure(reReportedDeployment)
      })

      it('should open a single database transaction', () => {
        expect(database.transaction).toHaveBeenCalledTimes(1)
      })

      it('should delete the previous row inside the transaction', () => {
        expect(failedDeployments.deleteFailedDeployment).toHaveBeenCalledWith(txClient, reReportedDeployment.entityId)
      })

      it('should save the new row inside the transaction', () => {
        expect(failedDeployments.saveSnapshotFailedDeployment).toHaveBeenCalledWith(txClient, reReportedDeployment)
      })

      it('should not call the cache-only escape hatch (the SQL methods handle the cache write themselves)', () => {
        expect(failedDeployments.cacheFailedDeployment).not.toHaveBeenCalled()
      })
    })

    describe('and the entity is not yet cached', () => {
      beforeEach(async () => {
        failedDeployments.findFailedDeployment.mockResolvedValueOnce(undefined)

        const reporter = createFailedDeploymentsReporter({ database, failedDeployments })
        await reporter.reportFailure(baseSnapshotDeployment)
      })

      it('should not open a database transaction', () => {
        expect(database.transaction).not.toHaveBeenCalled()
      })

      it('should save the row using the pool client', () => {
        expect(failedDeployments.saveSnapshotFailedDeployment).toHaveBeenCalledWith(database, baseSnapshotDeployment)
      })

      it('should not call delete', () => {
        expect(failedDeployments.deleteFailedDeployment).not.toHaveBeenCalled()
      })

      it('should not call the cache-only escape hatch (saveSnapshotFailedDeployment handles the cache write itself)', () => {
        expect(failedDeployments.cacheFailedDeployment).not.toHaveBeenCalled()
      })
    })
  })

  describe('and the deployment is not from a snapshot', () => {
    let nonSnapshotDeployment: FailedDeployment

    beforeEach(async () => {
      nonSnapshotDeployment = {
        entityType: EntityType.PROFILE,
        entityId: 'entity-id',
        failureTimestamp: 123,
        reason: FailureReason.DEPLOYMENT_ERROR,
        authChain: [],
        errorDescription: 'some-error'
      }

      const reporter = createFailedDeploymentsReporter({ database, failedDeployments })
      await reporter.reportFailure(nonSnapshotDeployment)
    })

    it('should not open a database transaction', () => {
      expect(database.transaction).not.toHaveBeenCalled()
    })

    it('should not call the SQL save/delete methods (non-snapshot failures are not persisted)', () => {
      expect(failedDeployments.saveSnapshotFailedDeployment).not.toHaveBeenCalled()
      expect(failedDeployments.deleteFailedDeployment).not.toHaveBeenCalled()
    })

    it('should write through to the cache via the cache-only escape hatch', () => {
      expect(failedDeployments.cacheFailedDeployment).toHaveBeenCalledWith(nonSnapshotDeployment)
    })
  })
})
