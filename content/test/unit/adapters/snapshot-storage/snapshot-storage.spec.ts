import { createConfigComponent } from '@well-known-components/env-config-provider'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { ISnapshotsRepository } from '../../../../src/adapters/snapshots-repository'
import { createSnapshotStorage } from '../../../../src/adapters/snapshot-storage'
import { createTestDatabaseComponent } from '../../../mocks/database-component-mock'

describe('snapshot storage', () => {
  const database = createTestDatabaseComponent()

  let logs: ILoggerComponent
  let snapshotsRepository: jest.Mocked<ISnapshotsRepository>

  beforeAll(async () => {
    logs = await createLogComponent({ config: createConfigComponent({ LOG_LEVEL: 'DEBUG' }) })
  })

  beforeEach(() => {
    snapshotsRepository = {
      streamActiveDeploymentsInTimeRange: jest.fn(),
      findSnapshotsStrictlyContainedInTimeRange: jest.fn(),
      saveSnapshot: jest.fn(),
      isOwnSnapshot: jest.fn(),
      getSnapshotHashesNotInTimeRange: jest.fn(),
      deleteSnapshotsInTimeRange: jest.fn(),
      snapshotIsOutdated: jest.fn(),
      getNumberOfActiveEntitiesInTimeRange: jest.fn(),
      saveProcessedSnapshot: jest.fn(),
      getProcessedSnapshots: jest.fn(),
      getAllSnapshotHashes: jest.fn()
    }
  })

  afterEach(async () => {
    jest.restoreAllMocks()
  })

  describe('has', () => {
    it('should forward to snapshotsRepository.isOwnSnapshot', async () => {
      const snapshotStorage = createSnapshotStorage({ database, logs, snapshotsRepository })
      snapshotsRepository.isOwnSnapshot.mockResolvedValueOnce(true)

      expect(await snapshotStorage.has('someHash')).toBe(true)
      expect(snapshotsRepository.isOwnSnapshot).toBeCalledWith(database, 'someHash')
    })
  })

  describe('filterProcessedSnapshotsFrom', () => {
    it('should return the result from the query when the hashes are not in cache', async () => {
      const snapshotStorage = createSnapshotStorage({ database, logs, snapshotsRepository })
      const processedSnapshot = 'someHash'
      snapshotsRepository.getProcessedSnapshots.mockResolvedValueOnce(new Set([processedSnapshot]))

      expect(await snapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])).toEqual(
        new Set([processedSnapshot])
      )
    })

    it('should cache the processed snapshots', async () => {
      const snapshotStorage = createSnapshotStorage({ database, logs, snapshotsRepository })
      const processedSnapshot = 'someHash'
      snapshotsRepository.getProcessedSnapshots.mockResolvedValue(new Set([processedSnapshot]))

      await snapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])
      expect(snapshotsRepository.getProcessedSnapshots).toBeCalledTimes(1)
      // now the result should be cached
      snapshotsRepository.getProcessedSnapshots.mockClear()
      await snapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])
      expect(snapshotsRepository.getProcessedSnapshots).toBeCalledTimes(0)
    })

    it('should query the db if not ALL the snapshots are in the cache', async () => {
      const snapshotStorage = createSnapshotStorage({ database, logs, snapshotsRepository })
      const processedSnapshot = 'someHash'
      snapshotsRepository.getProcessedSnapshots.mockResolvedValue(new Set([processedSnapshot]))

      await snapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])
      // now the snapshot 'processedSnapshot' is cached
      const anotherHashNotInCache = 'anotherHashNotInCache'
      await snapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot, anotherHashNotInCache])
      expect(snapshotsRepository.getProcessedSnapshots).toBeCalledWith(
        expect.anything(),
        expect.arrayContaining([processedSnapshot, anotherHashNotInCache])
      )
    })

    it('should not query the db if ALL the snapshots are in the cache', async () => {
      const snapshotStorage = createSnapshotStorage({ database, logs, snapshotsRepository })
      const processedSnapshot = 'someHash'
      const anotherProcessedSnapshot = 'anotherHash'
      const otherProcessedSnapshot = 'otherHash'

      snapshotsRepository.getProcessedSnapshots.mockResolvedValueOnce(
        new Set([processedSnapshot, otherProcessedSnapshot])
      )
      await snapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot, otherProcessedSnapshot])
      snapshotsRepository.getProcessedSnapshots.mockResolvedValueOnce(new Set([anotherProcessedSnapshot]))
      await snapshotStorage.filterProcessedSnapshotsFrom([anotherProcessedSnapshot])

      snapshotsRepository.getProcessedSnapshots.mockClear()
      await snapshotStorage.filterProcessedSnapshotsFrom([
        processedSnapshot,
        otherProcessedSnapshot,
        anotherProcessedSnapshot
      ])
      expect(snapshotsRepository.getProcessedSnapshots).toBeCalledTimes(0)
    })
  })

  describe('markSnapshotAsProcessed', () => {
    it('should save the snapshot and set the current process time', async () => {
      const snapshotStorage = createSnapshotStorage({ database, logs, snapshotsRepository })
      const processedSnapshot = 'someHash'
      const expectedProcessTime = Date.now()
      jest.spyOn(Date, 'now').mockReturnValue(expectedProcessTime)

      await snapshotStorage.markSnapshotAsProcessed(processedSnapshot)

      expect(snapshotsRepository.saveProcessedSnapshot).toBeCalledWith(database, processedSnapshot, expectedProcessTime)
    })

    it('should cache the processed snapshot when saving a snapshot', async () => {
      const snapshotStorage = createSnapshotStorage({ database, logs, snapshotsRepository })
      const processedSnapshot = 'someHash'

      await snapshotStorage.markSnapshotAsProcessed(processedSnapshot)
      snapshotsRepository.getProcessedSnapshots.mockClear()
      const processedSnapshots = await snapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])
      expect(snapshotsRepository.getProcessedSnapshots).toBeCalledTimes(0)
      expect(processedSnapshots).toEqual(new Set([processedSnapshot]))
    })
  })
})
