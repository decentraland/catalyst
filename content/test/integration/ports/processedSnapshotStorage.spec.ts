import * as snapshotQueries from '../../../src/logic/database-queries/snapshots-queries'
import { saveProcessedSnapshot } from '../../../src/logic/database-queries/snapshots-queries'

import { TestProgram } from '../TestProgram'
import { createDefaultServer, resetServer } from '../simpleTestEnvironment'

describe('precessed snapshot storage', () => {
  let server: TestProgram
  let dbQuerySpy

  beforeAll(async () => {
    dbQuerySpy = vi.spyOn(snapshotQueries, 'getProcessedSnapshots')
    server = await createDefaultServer()
  })

  beforeEach(async () => {
    dbQuerySpy.mockClear()
    await resetServer(server)
  })

  afterAll(async () => {
    vi.restoreAllMocks()
  })

  describe('processedFrom', () => {
    it('should return the result from the query when the hashes are not in cache', async () => {
      const { components } = server
      const processedSnapshot = 'someHash'
      await saveProcessedSnapshot(components.database, processedSnapshot, Date.now())

      expect(await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])).toEqual(
        new Set([processedSnapshot])
      )
    })

    it('should cache the processed snapshots', async () => {
      const { components } = server
      const processedSnapshot = 'someHash'
      await saveProcessedSnapshot(components.database, processedSnapshot, Date.now())

      await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])
      expect(dbQuerySpy).toBeCalledTimes(1)
      // now the result should be cached
      dbQuerySpy.mockClear()
      await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])
      expect(dbQuerySpy).toBeCalledTimes(0)
    })

    it('should query the db if not ALL the snapshots are in the cache', async () => {
      const { components } = server
      const processedSnapshot = 'someHash'
      await saveProcessedSnapshot(components.database, processedSnapshot, Date.now())

      await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot])
      // now the snapshot 'processedSnapshot' is cached
      const anotherHashNotInCache = 'anotherHashNotInCache'
      await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([processedSnapshot, anotherHashNotInCache])
      expect(dbQuerySpy).toBeCalledWith(
        expect.anything(),
        expect.arrayContaining([processedSnapshot, anotherHashNotInCache])
      )
    })

    it('should not query the db if ALL the snapshots are in the cache', async () => {
      const { components } = server
      const processedSnapshot = 'someHash'
      const anotherProcessedSnapshot = 'anotherHash'
      const otherProcessedSnapshot = 'otherHash'

      await saveProcessedSnapshot(components.database, processedSnapshot, Date.now())
      await saveProcessedSnapshot(components.database, anotherProcessedSnapshot, Date.now())
      await saveProcessedSnapshot(components.database, otherProcessedSnapshot, Date.now())

      await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([
        processedSnapshot,
        otherProcessedSnapshot
      ])
      await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([anotherProcessedSnapshot])

      // now the result should be cached
      dbQuerySpy.mockClear()
      await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([
        processedSnapshot,
        otherProcessedSnapshot,
        anotherProcessedSnapshot
      ])
      expect(dbQuerySpy).toBeCalledTimes(0)
    })
  })

  describe('markSnapshotAsProcessed', () => {
    it('should save the snapshot and set the current process time', async () => {
      const { components } = server
      const processedSnapshot = 'someHash'
      const saveProcessedSnapshotSpy = vi.spyOn(snapshotQueries, 'saveProcessedSnapshot').mockResolvedValue()
      const expectedProcessTime = Date.now()
      vi.spyOn(components.clock, 'now').mockReturnValue(expectedProcessTime)

      await components.processedSnapshotStorage.markSnapshotAsProcessed(processedSnapshot)

      expect(saveProcessedSnapshotSpy).toBeCalledWith(expect.anything(), processedSnapshot, expectedProcessTime)
    })

    it('should cache the processed snapshot when saving a snapshot', async () => {
      const { components } = server
      const processedSnapshot = 'someHash'

      await components.processedSnapshotStorage.markSnapshotAsProcessed(processedSnapshot)
      const processedSnapshots = await components.processedSnapshotStorage.filterProcessedSnapshotsFrom([
        processedSnapshot
      ])
      expect(dbQuerySpy).toBeCalledTimes(0)
      expect(processedSnapshots).toEqual(new Set([processedSnapshot]))
    })
  })
})
