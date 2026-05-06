import { EntityType } from '@dcl/schemas'
import {
  FailedDeployment,
  FailureReason,
  IFailedDeploymentsComponent,
  SnapshotFailedDeployment
} from '../../../../src/adapters/failed-deployments-cache'
import { IFailedDeploymentsRepository } from '../../../../src/adapters/failed-deployments-repository'
import { DatabaseTransactionalClient, IDatabaseComponent } from '../../../../src/adapters/database'
import { createFailedDeploymentsReporter } from '../../../../src/logic/failed-deployments-reporter'
import { createDatabaseMockedComponent } from '../../../mocks/database-component-mock'

describe('when the reporter is asked to report a failure', () => {
  let database: jest.Mocked<IDatabaseComponent>
  let failedDeployments: jest.Mocked<IFailedDeploymentsComponent>
  let failedDeploymentsRepository: jest.Mocked<IFailedDeploymentsRepository>
  let baseSnapshotDeployment: SnapshotFailedDeployment

  beforeEach(() => {
    database = createDatabaseMockedComponent()
    failedDeployments = {
      start: jest.fn(),
      getAllFailedDeployments: jest.fn(),
      findFailedDeployment: jest.fn(),
      removeFailedDeployment: jest.fn(),
      cacheFailedDeployment: jest.fn()
    }
    failedDeploymentsRepository = {
      saveSnapshotFailedDeployment: jest.fn(),
      deleteFailedDeployment: jest.fn(),
      getSnapshotFailedDeployments: jest.fn()
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

        const reporter = createFailedDeploymentsReporter({
          database,
          failedDeployments,
          failedDeploymentsRepository
        })
        await reporter.reportFailure(reReportedDeployment)
      })

      it('should open a single database transaction', () => {
        expect(database.transaction).toHaveBeenCalledTimes(1)
      })

      it('should delete the previous row inside the transaction', () => {
        expect(failedDeploymentsRepository.deleteFailedDeployment).toHaveBeenCalledWith(
          txClient,
          reReportedDeployment.entityId
        )
      })

      it('should save the new row inside the transaction', () => {
        expect(failedDeploymentsRepository.saveSnapshotFailedDeployment).toHaveBeenCalledWith(
          txClient,
          reReportedDeployment
        )
      })

      it('should write through to the cache after persistence succeeds', () => {
        expect(failedDeployments.cacheFailedDeployment).toHaveBeenCalledWith(reReportedDeployment)
      })
    })

    describe('and the entity is not yet cached', () => {
      beforeEach(async () => {
        failedDeployments.findFailedDeployment.mockResolvedValueOnce(undefined)

        const reporter = createFailedDeploymentsReporter({
          database,
          failedDeployments,
          failedDeploymentsRepository
        })
        await reporter.reportFailure(baseSnapshotDeployment)
      })

      it('should not open a database transaction', () => {
        expect(database.transaction).not.toHaveBeenCalled()
      })

      it('should save the row using the pool client', () => {
        expect(failedDeploymentsRepository.saveSnapshotFailedDeployment).toHaveBeenCalledWith(
          database,
          baseSnapshotDeployment
        )
      })

      it('should not call delete on the repository', () => {
        expect(failedDeploymentsRepository.deleteFailedDeployment).not.toHaveBeenCalled()
      })

      it('should write through to the cache after persistence succeeds', () => {
        expect(failedDeployments.cacheFailedDeployment).toHaveBeenCalledWith(baseSnapshotDeployment)
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

      const reporter = createFailedDeploymentsReporter({
        database,
        failedDeployments,
        failedDeploymentsRepository
      })
      await reporter.reportFailure(nonSnapshotDeployment)
    })

    it('should not open a database transaction', () => {
      expect(database.transaction).not.toHaveBeenCalled()
    })

    it('should not call the repository (non-snapshot failures are not persisted)', () => {
      expect(failedDeploymentsRepository.saveSnapshotFailedDeployment).not.toHaveBeenCalled()
      expect(failedDeploymentsRepository.deleteFailedDeployment).not.toHaveBeenCalled()
    })

    it('should still write through to the cache', () => {
      expect(failedDeployments.cacheFailedDeployment).toHaveBeenCalledWith(nonSnapshotDeployment)
    })
  })
})
