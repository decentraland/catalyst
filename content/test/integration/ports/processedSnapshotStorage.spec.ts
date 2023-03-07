import * as snapshotQueries from '../../../src/logic/database-queries/snapshots-queries'
import { saveProcessedSnapshot } from '../../../src/logic/database-queries/snapshots-queries'
import { setupTestEnvironment, testCaseWithComponents } from '../E2ETestEnvironment'

describe('precessed snapshot storage', () => {
  const getTestEnv = setupTestEnvironment()

  describe('processedFrom', () => {
    beforeEach(() => jest.restoreAllMocks())

    testCaseWithComponents(
      getTestEnv,
      'should return the result from they query when the hashes are not in cache',
      async (components) => {
        const processedSnapshot = 'someHash'
        await saveProcessedSnapshot(components.database, processedSnapshot, Date.now())

        expect(await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])).toEqual(
          new Set([processedSnapshot])
        )
      }
    )

    testCaseWithComponents(getTestEnv, 'should cache the processed snapshots', async (components) => {
      const processedSnapshot = 'someHash'
      await saveProcessedSnapshot(components.database, processedSnapshot, Date.now())

      const dbQuerySpy = jest.spyOn(snapshotQueries, 'getProcessedSnapshots')
      await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])
      expect(dbQuerySpy).toBeCalledTimes(1)
      // now the result should be cached
      dbQuerySpy.mockReset()
      await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])
      expect(dbQuerySpy).toBeCalledTimes(0)
    })

    testCaseWithComponents(
      getTestEnv,
      'should query the db if not ALL the snapshots are in the cache',
      async (components) => {
        const processedSnapshot = 'someHash'
        await saveProcessedSnapshot(components.database, processedSnapshot, Date.now())

        await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])
        // now the snapshot 'processedSnapshot' is cached
        const anotherHashNotInCache = 'anotherHashNotInCache'
        const dbQuerySpy = jest.spyOn(snapshotQueries, 'getProcessedSnapshots')
        await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot, anotherHashNotInCache])
        expect(dbQuerySpy).toBeCalledWith(
          expect.anything(),
          expect.arrayContaining([processedSnapshot, anotherHashNotInCache])
        )
      }
    )

    testCaseWithComponents(
      getTestEnv,
      'should not query the db if ALL the snapshots are in the cache',
      async (components) => {
        const processedSnapshot = 'someHash'
        const anotherProcessedSnapshot = 'anotherHash'
        const otherProcessedSnapshot = 'otherHash'

        await saveProcessedSnapshot(components.database, processedSnapshot, Date.now())
        await saveProcessedSnapshot(components.database, anotherProcessedSnapshot, Date.now())
        await saveProcessedSnapshot(components.database, otherProcessedSnapshot, Date.now())

        await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot, otherProcessedSnapshot])
        await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([anotherProcessedSnapshot])

        const dbQuerySpy = jest.spyOn(snapshotQueries, 'getProcessedSnapshots')
        await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([
          processedSnapshot,
          otherProcessedSnapshot,
          anotherProcessedSnapshot
        ])
        expect(dbQuerySpy).toBeCalledTimes(0)
      }
    )
  })

  describe('markSnapshotAsProcessed', () => {
    testCaseWithComponents(
      getTestEnv,
      'should save the snapshot and set the current process time',
      async (components) => {
        const processedSnapshot = 'someHash'
        const saveProcessedSnapshotSpy = jest.spyOn(snapshotQueries, 'saveProcessedSnapshot').mockResolvedValue()
        const expectedProcessTime = Date.now()
        jest.spyOn(components.clock, 'now').mockReturnValue(expectedProcessTime)

        await components.processedSnapshotStorage.markSnapshotAsProcessed(processedSnapshot)

        expect(saveProcessedSnapshotSpy).toBeCalledWith(expect.anything(), processedSnapshot, expectedProcessTime)
      }
    )

    testCaseWithComponents(
      getTestEnv,
      'should cache the processed snapshot when saving a snapshot',
      async (components) => {
        const processedSnapshot = 'someHash'

        await components.processedSnapshotStorage.markSnapshotAsProcessed(processedSnapshot)
        const dbQuerySpy = jest.spyOn(snapshotQueries, 'getProcessedSnapshots')
        const processedSnapshots = await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])
        expect(dbQuerySpy).toBeCalledTimes(0)
        expect(processedSnapshots).toEqual(new Set([processedSnapshot]))
      }
    )
  })
})
