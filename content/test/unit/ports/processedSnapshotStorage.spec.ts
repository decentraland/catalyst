import { createConfigComponent } from '@well-known-components/env-config-provider'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import * as snapshotQueries from '../../../src/logic/database-queries/snapshots-queries'
import { createTestDatabaseComponent } from '../../../src/ports/postgres'
import { createProcessedSnapshotStorage } from '../../../src/ports/processedSnapshotStorage'

describe('processed snapshot storage', () => {
  const database = createTestDatabaseComponent()
  const clock = { now: Date.now }

  let logs: ILoggerComponent

  beforeAll(async () => {
    logs = await createLogComponent({ config: createConfigComponent({ LOG_LEVEL: 'DEBUG' }) })
  })

  describe('processedFrom', () => {
    it('should return the result from they query when the hashes are not in cache', async () => {
      const processedSnapshotStorage = createProcessedSnapshotStorage({ database, clock, logs })
      const processedSnapshot = 'someHash'
      jest.spyOn(snapshotQueries, 'getProcessedSnapshots').mockResolvedValue(new Set([processedSnapshot]))

      expect(await processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])).toEqual(
        new Set([processedSnapshot])
      )
    })

    it('should cache the processed snapshots', async () => {
      const processedSnapshotStorage = createProcessedSnapshotStorage({ database, clock, logs })
      const processedSnapshot = 'someHash'
      const dbQuerySpy = jest
        .spyOn(snapshotQueries, 'getProcessedSnapshots')
        .mockResolvedValue(new Set([processedSnapshot]))

      await processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])
      expect(dbQuerySpy).toBeCalledTimes(1)
      // now the result should be cached
      dbQuerySpy.mockReset()
      await processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])
      expect(dbQuerySpy).toBeCalledTimes(0)
    })

    it('should query the db if not ALL the snapshots are in the cache', async () => {
      const processedSnapshotStorage = createProcessedSnapshotStorage({ database, clock, logs })
      const processedSnapshot = 'someHash'
      const dbQuerySpy = jest
        .spyOn(snapshotQueries, 'getProcessedSnapshots')
        .mockResolvedValue(new Set([processedSnapshot]))

      await processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])
      // now the snapshot 'processedSnapshot' is cached
      const anotherHashNotInCache = 'anotherHashNotInCache'
      await processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot, anotherHashNotInCache])
      expect(dbQuerySpy).toBeCalledWith(
        expect.anything(),
        expect.arrayContaining([processedSnapshot, anotherHashNotInCache])
      )
    })

    it('should not query the db if ALL the snapshots are in the cache', async () => {
      const processedSnapshotStorage = createProcessedSnapshotStorage({ database, clock, logs })
      const processedSnapshot = 'someHash'
      const anotherProcessedSnapshot = 'anotherHash'
      const otherProcessedSnapshot = 'otherHash'

      jest
        .spyOn(snapshotQueries, 'getProcessedSnapshots')
        .mockResolvedValue(new Set([processedSnapshot, otherProcessedSnapshot]))
      await processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot, otherProcessedSnapshot])
      jest.spyOn(snapshotQueries, 'getProcessedSnapshots').mockResolvedValue(new Set([anotherProcessedSnapshot]))
      await processedSnapshotStorage.filterProcessedSnapshotsFrom([anotherProcessedSnapshot])

      const dbQuerySpy = jest.spyOn(snapshotQueries, 'getProcessedSnapshots')
      dbQuerySpy.mockReset()
      await processedSnapshotStorage.filterProcessedSnapshotsFrom([
        processedSnapshot,
        otherProcessedSnapshot,
        anotherProcessedSnapshot
      ])
      expect(dbQuerySpy).toBeCalledTimes(0)
    })
  })

  describe('markSnapshotAsProcessed', () => {
    it('should save the snapshot and set the current process time', async () => {
      const processedSnapshotStorage = createProcessedSnapshotStorage({ database, clock, logs })
      const processedSnapshot = 'someHash'
      const saveProcessedSnapshotSpy = jest.spyOn(snapshotQueries, 'saveProcessedSnapshot').mockResolvedValue()
      const expectedProcessTime = Date.now()
      jest.spyOn(clock, 'now').mockReturnValue(expectedProcessTime)

      await processedSnapshotStorage.markSnapshotAsProcessed(processedSnapshot)

      expect(saveProcessedSnapshotSpy).toBeCalledWith(database, processedSnapshot, expectedProcessTime)
    })

    it('should cache the processed snapshot when saving a snapshot', async () => {
      const processedSnapshotStorage = createProcessedSnapshotStorage({ database, clock, logs })
      const processedSnapshot = 'someHash'
      jest.spyOn(snapshotQueries, 'saveProcessedSnapshot').mockResolvedValue()

      await processedSnapshotStorage.markSnapshotAsProcessed(processedSnapshot)
      const dbQuerySpy = jest.spyOn(snapshotQueries, 'getProcessedSnapshots')
      const processedSnapshots = await processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])
      expect(dbQuerySpy).toBeCalledTimes(0)
      expect(processedSnapshots).toEqual(new Set([processedSnapshot]))
    })
  })
})
