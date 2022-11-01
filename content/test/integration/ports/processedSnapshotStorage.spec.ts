import * as snapshotQueries from '../../../src/logic/database-queries/snapshots-queries'
import { saveProcessedSnapshot } from '../../../src/logic/database-queries/snapshots-queries'
import { loadStandaloneTestEnvironment, testCaseWithComponents } from '../E2ETestEnvironment'

loadStandaloneTestEnvironment()('precessed snapshot storage', (testEnv) => {

  describe('processedFrom', () => {

    beforeEach(() => jest.restoreAllMocks())

    testCaseWithComponents(
      testEnv,
      'should return the result from they query when the hashes are not in cache',
      async (components) => {
        const processedSnapshot = 'someHash'
        await saveProcessedSnapshot(components.database, processedSnapshot, Date.now())

        expect(await components.processedSnapshotStorage.processedFrom([processedSnapshot])).toEqual(new Set([processedSnapshot]))
      }
    )

    testCaseWithComponents(
      testEnv,
      'should cache the processed snapshots',
      async (components) => {
        const processedSnapshot = 'someHash'
        await saveProcessedSnapshot(components.database, processedSnapshot, Date.now())

        const dbQuerySpy = jest.spyOn(snapshotQueries, 'getProcessedSnapshots')
        await components.processedSnapshotStorage.processedFrom([processedSnapshot])
        expect(dbQuerySpy).toBeCalledTimes(1)
        // now the result should be cached
        dbQuerySpy.mockReset()
        await components.processedSnapshotStorage.processedFrom([processedSnapshot])
        expect(dbQuerySpy).toBeCalledTimes(0)
      }
    )

    testCaseWithComponents(
      testEnv,
      'should query the db if not ALL the snapshots are in the cache',
      async (components) => {
        const processedSnapshot = 'someHash'
        await saveProcessedSnapshot(components.database, processedSnapshot, Date.now())

        await components.processedSnapshotStorage.processedFrom([processedSnapshot])
        // now the snapshot 'processedSnapshot' is cached
        const anotherHashNotInCache = 'anotherHashNotInCache'
        const dbQuerySpy = jest.spyOn(snapshotQueries, 'getProcessedSnapshots')
        await components.processedSnapshotStorage.processedFrom([processedSnapshot, anotherHashNotInCache])
        expect(dbQuerySpy).toBeCalledWith(expect.anything(), expect.arrayContaining([processedSnapshot, anotherHashNotInCache]))
      }
    )

    testCaseWithComponents(
      testEnv,
      'should not query the db if ALL the snapshots are in the cache',
      async (components) => {
        const processedSnapshot = 'someHash'
        const anotherProcessedSnapshot = 'anotherHash'
        const otherProcessedSnapshot = 'otherHash'

        await saveProcessedSnapshot(components.database, processedSnapshot, Date.now())
        await saveProcessedSnapshot(components.database, anotherProcessedSnapshot, Date.now())
        await saveProcessedSnapshot(components.database, otherProcessedSnapshot, Date.now())

        await components.processedSnapshotStorage.processedFrom([processedSnapshot, otherProcessedSnapshot])
        await components.processedSnapshotStorage.processedFrom([anotherProcessedSnapshot])

        const dbQuerySpy = jest.spyOn(snapshotQueries, 'getProcessedSnapshots')
        await components.processedSnapshotStorage.processedFrom([processedSnapshot, otherProcessedSnapshot, anotherProcessedSnapshot])
        expect(dbQuerySpy).toBeCalledTimes(0)
      }
    )
  })

  describe('saveProcessed', () => {

    testCaseWithComponents(
      testEnv,
      'should save the snapshot and set the current process time',
      async (components) => {
        const processedSnapshot = 'someHash'
        const saveProcessedSnapshotSpy = jest.spyOn(snapshotQueries, 'saveProcessedSnapshot').mockResolvedValue()
        const expectedProcessTime = Date.now()
        jest.spyOn(components.clock, 'now').mockReturnValue(expectedProcessTime)

        await components.processedSnapshotStorage.saveProcessed(processedSnapshot)

        expect(saveProcessedSnapshotSpy).toBeCalledWith(expect.anything(), processedSnapshot, expectedProcessTime)
      }
    )

    testCaseWithComponents(
      testEnv,
      'should cache the processed snapshot when saving a snapshot',
      async (components) => {
        const processedSnapshot = 'someHash'

        await components.processedSnapshotStorage.saveProcessed(processedSnapshot)
        const dbQuerySpy = jest.spyOn(snapshotQueries, 'getProcessedSnapshots')
        const processedSnapshots = await components.processedSnapshotStorage.processedFrom([processedSnapshot])
        expect(dbQuerySpy).toBeCalledTimes(0)
        expect(processedSnapshots).toEqual(new Set([processedSnapshot]))
      }
    )
  })
})
