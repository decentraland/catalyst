
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import * as snapshotQueries from '../../../src/logic/database-queries/snapshots-queries'
import { createTestDatabaseComponent } from '../../../src/ports/postgres'
import { createProcessedSnapshotStorage } from '../../../src/ports/processedSnapshotStorage'


describe('failed deployments', () => {

  const database = createTestDatabaseComponent()
  const clock = { now: Date.now }
  let logs: ILoggerComponent

  beforeAll(async () => {
    logs = await createLogComponent({
      config: createConfigComponent({
        LOG_LEVEL: 'DEBUG'
      })
    })
  })

  beforeEach(() => jest.restoreAllMocks())

  describe('wasSnapshotProcessed', () => {
    it('should return false when snapshot was not processed', async () => {
      const processedSnapshotStorage = createProcessedSnapshotStorage({ database, logs, clock })
      const processedSnapshot = 'someHash'
      jest.spyOn(snapshotQueries, 'getProcessedSnapshots').mockResolvedValue(new Set(['anotherHash']))

      expect(await processedSnapshotStorage.wasSnapshotProcessed(processedSnapshot)).toBeFalsy()
    })

    it('should return true when snapshot was processed', async () => {
      const processedSnapshotStorage = createProcessedSnapshotStorage({ database, logs, clock })
      const processedSnapshot = 'someHash'
      jest.spyOn(snapshotQueries, 'getProcessedSnapshots').mockResolvedValue(new Set([processedSnapshot]))

      expect(await processedSnapshotStorage.wasSnapshotProcessed(processedSnapshot)).toBeTruthy()
    })

    it('should return true when snapshot was not processed but did all the replaced ones', async () => {
      const processedSnapshotStorage = createProcessedSnapshotStorage({ database, logs, clock })
      const processedSnapshot = 'someHash'
      const replacedHashes = ['h1', 'h2']
      jest.spyOn(snapshotQueries, 'getProcessedSnapshots').mockResolvedValue(new Set(replacedHashes))
      jest.spyOn(snapshotQueries, 'deleteProcessedSnapshots').mockImplementation()
      jest.spyOn(snapshotQueries, 'saveProcessedSnapshot').mockImplementation()
      jest.spyOn(database, 'transaction').mockImplementation(async (fnToRun) => await fnToRun(database))

      expect(await processedSnapshotStorage.wasSnapshotProcessed(processedSnapshot, replacedHashes)).toBeTruthy()
    })

    it('should return true when snapshot was not processed and did some but not all the replaced ones', async () => {
      const processedSnapshotStorage = createProcessedSnapshotStorage({ database, logs, clock })
      const processedSnapshot = 'someHash'
      const replacedHashes = ['h1', 'h2']
      jest.spyOn(snapshotQueries, 'getProcessedSnapshots').mockResolvedValue(new Set(['h1']))
      jest.spyOn(snapshotQueries, 'deleteProcessedSnapshots').mockImplementation()
      jest.spyOn(snapshotQueries, 'saveProcessedSnapshot').mockImplementation()
      jest.spyOn(database, 'transaction').mockImplementation(async (fnToRun) => await fnToRun(database))

      expect(await processedSnapshotStorage.wasSnapshotProcessed(processedSnapshot, replacedHashes)).toBeFalsy()
    })

    it('when the replaced hashes were processed, it should save the new snapshot hash and delete the replaced ones', async () => {
      const processedSnapshotStorage = createProcessedSnapshotStorage({ database, logs, clock })
      const processedSnapshot = 'someHash'
      const replacedHashes = ['h1', 'h2']
      jest.spyOn(snapshotQueries, 'getProcessedSnapshots').mockResolvedValue(new Set(replacedHashes))
      const deleteSpy = jest.spyOn(snapshotQueries, 'deleteProcessedSnapshots').mockImplementation()
      const saveSpy = jest.spyOn(snapshotQueries, 'saveProcessedSnapshot').mockImplementation()
      const txSpy = jest.spyOn(database, 'transaction').mockImplementation(async (fnToRun) => await fnToRun(database))

      expect(await processedSnapshotStorage.wasSnapshotProcessed(processedSnapshot, replacedHashes)).toBeTruthy()
      expect(deleteSpy).toHaveBeenCalledWith(database, replacedHashes)
      expect(saveSpy).toHaveBeenCalledWith(database, processedSnapshot, expect.anything())
      expect(txSpy).toHaveBeenCalled()
    })

    it('when only some of the replaced snapshots were processed, it should not save the new snapshot hash and do not delete the replaced ones', async () => {
      const processedSnapshotStorage = createProcessedSnapshotStorage({ database, logs, clock })
      const processedSnapshot = 'someHash'
      const replacedHashes = ['h1', 'h2']
      jest.spyOn(snapshotQueries, 'getProcessedSnapshots').mockResolvedValue(new Set(['h1']))
      const deleteSpy = jest.spyOn(snapshotQueries, 'deleteProcessedSnapshots').mockImplementation()
      const saveSpy = jest.spyOn(snapshotQueries, 'saveProcessedSnapshot').mockImplementation()
      const txSpy = jest.spyOn(database, 'transaction').mockImplementation(async (fnToRun) => await fnToRun(database))

      expect(await processedSnapshotStorage.wasSnapshotProcessed(processedSnapshot, replacedHashes)).toBeFalsy()
      expect(deleteSpy).not.toHaveBeenCalled()
      expect(saveSpy).not.toHaveBeenCalled()
      expect(txSpy).not.toHaveBeenCalled()
    })
  })

  describe('markSnapshotAsProcessed', () => {
    it('should save the new snapshot hash and delete the replaced ones', async () => {
      const processedSnapshotStorage = createProcessedSnapshotStorage({ database, logs, clock })
      const processedSnapshot = 'someHash'
      const replacedHashes = ['h1', 'h2']
      jest.spyOn(snapshotQueries, 'getProcessedSnapshots').mockResolvedValue(new Set(replacedHashes))
      const deleteSpy = jest.spyOn(snapshotQueries, 'deleteProcessedSnapshots').mockImplementation()
      const saveSpy = jest.spyOn(snapshotQueries, 'saveProcessedSnapshot').mockImplementation()
      const txSpy = jest.spyOn(database, 'transaction').mockImplementation(async (fnToRun) => await fnToRun(database))

      await processedSnapshotStorage.markSnapshotProcessed(processedSnapshot, replacedHashes)
      expect(deleteSpy).toHaveBeenCalledWith(database, replacedHashes)
      expect(saveSpy).toHaveBeenCalledWith(database, processedSnapshot, expect.anything())
      expect(txSpy).toHaveBeenCalled()
    })
  })

})
