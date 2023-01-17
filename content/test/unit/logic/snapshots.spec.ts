import { createFsComponent, IContentStorageComponent } from '@dcl/catalyst-storage'
import { SnapshotSyncDeployment } from '@dcl/schemas'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import * as snapshotQueries from '../../../src/logic/database-queries/snapshots-queries'
import { generateAndStoreSnapshot, generateSnapshotsInMultipleTimeRanges } from '../../../src/logic/snapshots'
import * as tr from '../../../src/logic/time-range'
import { metricsDeclaration } from '../../../src/metrics'
import { Denylist } from '../../../src/ports/denylist'
import * as fileWriter from '../../../src/ports/fileWriter'
import { IFile } from '../../../src/ports/fileWriter'
import { createTestDatabaseComponent } from '../../../src/ports/postgres'

describe('generate snapshot', () => {

  const database = createTestDatabaseComponent()
  const fs = createFsComponent()
  const metrics = createTestMetricsComponent(metricsDeclaration)
  const staticConfigs = { contentStorageFolder: '', tmpDownloadFolder: '' }
  const denylist: Denylist = { isDenylisted: jest.fn() }
  const aTimeRange = { initTimestamp: 1, endTimestamp: 2 }
  const storage: IContentStorageComponent = {
    storeStream: jest.fn(),
    storeStreamAndCompress: jest.fn(),
    delete: jest.fn(),
    retrieve: jest.fn(),
    exist: jest.fn(),
    existMultiple: async (fileIds: string[]) => {
      const exist = new Map()
      for (const fileId of fileIds) {
        exist.set(fileId, true)
      }
      return exist
    },
    allFileIds: jest.fn()
  }
  let logs: ILoggerComponent

  beforeAll(async () => {
    logs = await createLogComponent({ config: createConfigComponent({ LOG_LEVEL: 'DEBUG' }) })
  })

  beforeEach(() => {
    jest.restoreAllMocks()
    jest.spyOn(database, 'transaction').mockImplementation(async (f) => { await f(database) })
  })

  it('should stream active entities with given time range', async () => {
    const streamSpy = mockStreamedActiveEntitiesWith([])
    mockCreateFileWriterMockWith('filePath', 'hash')
    const expectedTimeRange = { initTimestamp: 1, endTimestamp: 2 }

    await generateAndStoreSnapshot({ database, fs, metrics, logs, staticConfigs, storage, denylist }, expectedTimeRange)
    expect(streamSpy).toBeCalledWith(expect.anything(), expectedTimeRange)
  })

  it('should append snapshot header to tmp file', async () => {
    mockStreamedActiveEntitiesWith([])
    const fileWriterMock = mockCreateFileWriterMockWith('filePath', 'hash')
    await generateAndStoreSnapshot({ database, fs, metrics, logs, staticConfigs, storage, denylist }, aTimeRange)
    expect(fileWriterMock.appendDebounced).toBeCalledWith('### Decentraland json snapshot\n')
    expect(fileWriterMock.appendDebounced).toBeCalledTimes(1)
  })

  it('should close tmp file after streaming all active entities', async () => {
    mockStreamedActiveEntitiesWith([])
    const fileWriterMock = mockCreateFileWriterMockWith('filePath', 'hash')
    await generateAndStoreSnapshot({ database, fs, metrics, logs, staticConfigs, storage, denylist }, aTimeRange)
    expect(fileWriterMock.close).toBeCalledTimes(1)
  })

  it('should return snapshot hash and total number of entities', async () => {
    mockStreamedActiveEntitiesWith([
      { entityId: 'id1', entityType: 't1', pointers: ['p1'], entityTimestamp: 0, authChain: [] },
      { entityId: 'id2', entityType: 't2', pointers: ['p2'], entityTimestamp: 1, authChain: [] },
      { entityId: 'id3', entityType: 't3', pointers: ['p3'], entityTimestamp: 2, authChain: [] }
    ])
    const expectedSnapshotHash = 'aHash'
    mockCreateFileWriterMockWith('filePath', expectedSnapshotHash)
    const { hash, numberOfEntities } =
      await generateAndStoreSnapshot({ database, fs, metrics, logs, staticConfigs, storage, denylist }, aTimeRange)
    expect(hash).toEqual(expectedSnapshotHash)
    expect(numberOfEntities).toEqual(3)
  })
})

describe('generate snapshot in multiple', () => {

  const database = createTestDatabaseComponent()
  const fs = createFsComponent()
  const metrics = createTestMetricsComponent(metricsDeclaration)
  const staticConfigs = { contentStorageFolder: '', tmpDownloadFolder: '' }
  const denylist: Denylist = { isDenylisted: jest.fn() }
  const clock = { now: Date.now }
  const storage: IContentStorageComponent = {
    storeStream: jest.fn(),
    storeStreamAndCompress: jest.fn(),
    delete: jest.fn(),
    retrieve: jest.fn(),
    exist: jest.fn(),
    existMultiple: async (fileIds: string[]) => {
      const exist = new Map()
      for (const fileId of fileIds) {
        exist.set(fileId, true)
      }
      return exist
    },
    allFileIds: jest.fn()
  }
  let logs: ILoggerComponent
  const saveFn = snapshotQueries.saveSnapshot
  const deleteFn = snapshotQueries.deleteSnapshotsInTimeRange
  let saveSpy: jest.SpyInstance<ReturnType<typeof saveFn>, Parameters<typeof saveFn>>
  let deleteSpy: jest.SpyInstance<ReturnType<typeof deleteFn>, Parameters<typeof deleteFn>>
  let generationTimestamp: number

  beforeAll(async () => {
    logs = await createLogComponent({ config: createConfigComponent({ LOG_LEVEL: 'DEBUG' }) })
  })

  beforeEach(() => {
    jest.restoreAllMocks()
    jest.spyOn(database, 'transaction').mockImplementation(async (f) => { await f(database) })
    saveSpy = jest.spyOn(snapshotQueries, 'saveSnapshot').mockImplementation()
    deleteSpy = jest.spyOn(snapshotQueries, 'deleteSnapshotsInTimeRange').mockImplementation()
    jest.spyOn(snapshotQueries, 'getNumberOfActiveEntitiesInTimeRange').mockImplementation()
    jest.spyOn(snapshotQueries, 'getSnapshotHashesNotInTimeRange').mockResolvedValue(new Set())
    jest.spyOn(snapshotQueries, 'snapshotIsOutdated').mockResolvedValue(false)
    generationTimestamp = Date.now()
    jest.spyOn(clock, 'now').mockReturnValue(generationTimestamp)
  })

  it('should generate snapshot for time range when there are no saved snapshots for that time range', async () => {
    mockStreamedActiveEntitiesWith([])
    const oneYearRange = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR }
    jest.spyOn(snapshotQueries, 'findSnapshotsStrictlyContainedInTimeRange').mockResolvedValue([])
    jest.spyOn(tr, 'divideTimeInYearsMonthsWeeksAndDays').mockReturnValue({
      intervals: [oneYearRange],
      remainder: { initTimestamp: tr.MS_PER_YEAR, endTimestamp: tr.MS_PER_YEAR }
    })
    const expectedHash = 'hash'
    mockCreateFileWriterMockWith('filePath', expectedHash)

    const snapshots = await generateSnapshotsInMultipleTimeRanges({ database, fs, metrics, logs, staticConfigs, storage, denylist, clock }, oneYearRange)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toEqual({
      hash: expectedHash,
      numberOfEntities: 0,
      replacedSnapshotHashes: [],
      timeRange: oneYearRange,
      generationTimestamp
    })
  })

  it('should generate snapshot when there are multiple snapshots that cover the interval', async () => {
    mockStreamedActiveEntitiesWith([])
    const oneYearRange = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR }
    const firstHalfYear = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR / 2 }
    const secondHalfYear = { initTimestamp: tr.MS_PER_YEAR / 2, endTimestamp: tr.MS_PER_YEAR }
    jest.spyOn(snapshotQueries, 'findSnapshotsStrictlyContainedInTimeRange').mockResolvedValue([
      { hash: 'h1', numberOfEntities: 1, replacedSnapshotHashes: [], timeRange: firstHalfYear, generationTimestamp },
      { hash: 'h2', numberOfEntities: 2, replacedSnapshotHashes: [], timeRange: secondHalfYear, generationTimestamp }
    ])
    jest.spyOn(tr, 'divideTimeInYearsMonthsWeeksAndDays').mockReturnValue({
      intervals: [oneYearRange],
      remainder: { initTimestamp: tr.MS_PER_YEAR, endTimestamp: tr.MS_PER_YEAR }
    })
    const expectedHash = 'hash'
    mockCreateFileWriterMockWith('filePath', expectedHash)

    const expectedReplacedHashes = ['h1', 'h2']
    const expectedSnapshot = {
      hash: expectedHash,
      numberOfEntities: 0,
      replacedSnapshotHashes: expectedReplacedHashes,
      timeRange: oneYearRange,
      generationTimestamp
    }

    const snapshots = await generateSnapshotsInMultipleTimeRanges({ database, fs, metrics, logs, staticConfigs, storage, denylist, clock }, oneYearRange)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toEqual(expectedSnapshot)
    expect(storage.delete).toBeCalledWith(expect.arrayContaining(expectedReplacedHashes))
    expect(deleteSpy).toBeCalledWith(expect.anything(), expect.arrayContaining(expectedReplacedHashes), oneYearRange)
    expect(saveSpy).toBeCalledWith(expect.anything(), expectedSnapshot)
  })

  it('should re-generate snapshot when there the current snapshot is not in storage', async () => {
    mockStreamedActiveEntitiesWith([])
    const oneYearRange = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR }
    jest.spyOn(snapshotQueries, 'findSnapshotsStrictlyContainedInTimeRange').mockResolvedValue([
      { hash: 'snapshotNotInStorage', numberOfEntities: 1, replacedSnapshotHashes: [], timeRange: oneYearRange, generationTimestamp },
    ])
    jest.spyOn(tr, 'divideTimeInYearsMonthsWeeksAndDays').mockReturnValue({
      intervals: [oneYearRange],
      remainder: { initTimestamp: tr.MS_PER_YEAR, endTimestamp: tr.MS_PER_YEAR }
    })
    jest.spyOn(storage, 'existMultiple').mockImplementation(async () => {
      const exist = new Map()
      exist.set('snapshotNotInStorage', false)
      return exist
    })
    const expectedHash = 'hash'
    mockCreateFileWriterMockWith('filePath', expectedHash)

    const expectedReplacedHashes = ['snapshotNotInStorage']
    const expectedSnapshot = {
      hash: expectedHash,
      numberOfEntities: 0,
      replacedSnapshotHashes: expectedReplacedHashes,
      timeRange: oneYearRange,
      generationTimestamp
    }

    const snapshots = await generateSnapshotsInMultipleTimeRanges({ database, fs, metrics, logs, staticConfigs, storage, denylist, clock }, oneYearRange)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toEqual(expectedSnapshot)
    expect(storage.delete).toBeCalledWith(expect.arrayContaining(expectedReplacedHashes))
    expect(deleteSpy).toBeCalledWith(expect.anything(), expect.arrayContaining(expectedReplacedHashes), oneYearRange)
    expect(saveSpy).toBeCalledWith(expect.anything(), expectedSnapshot)
  })

  it('should delete old snapshots within the interval of the new snapshot generated', async () => {
    mockStreamedActiveEntitiesWith([])
    const oneYearRange = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR }
    const timeRangeWithinTheYear = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR / 2 }
    jest.spyOn(snapshotQueries, 'findSnapshotsStrictlyContainedInTimeRange').mockResolvedValue([
      { hash: 'h1', numberOfEntities: 1, replacedSnapshotHashes: [], timeRange: timeRangeWithinTheYear, generationTimestamp },
    ])
    jest.spyOn(tr, 'divideTimeInYearsMonthsWeeksAndDays').mockReturnValue({
      intervals: [oneYearRange],
      remainder: { initTimestamp: tr.MS_PER_YEAR, endTimestamp: tr.MS_PER_YEAR }
    })
    const expectedHash = 'hash'
    mockCreateFileWriterMockWith('filePath', expectedHash)

    await generateSnapshotsInMultipleTimeRanges({ database, fs, metrics, logs, staticConfigs, storage, denylist, clock }, oneYearRange)
    expect(storage.delete).toBeCalledWith(expect.arrayContaining(['h1']))
    expect(deleteSpy).toBeCalledWith(expect.anything(), expect.arrayContaining(['h1']), oneYearRange)
  })

  it('should delete snapshots when they are replaced', async () => {
    mockStreamedActiveEntitiesWith([])
    const oneYearRange = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR }
    const firstHalfYear = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR / 2 }
    const secondHalfYear = { initTimestamp: tr.MS_PER_YEAR / 2, endTimestamp: tr.MS_PER_YEAR }
    jest.spyOn(snapshotQueries, 'findSnapshotsStrictlyContainedInTimeRange').mockResolvedValue([
      { hash: 'h1', numberOfEntities: 1, replacedSnapshotHashes: [], timeRange: firstHalfYear, generationTimestamp },
      { hash: 'h2', numberOfEntities: 2, replacedSnapshotHashes: [], timeRange: secondHalfYear, generationTimestamp }
    ])
    jest.spyOn(tr, 'divideTimeInYearsMonthsWeeksAndDays').mockReturnValue({
      intervals: [oneYearRange],
      remainder: { initTimestamp: tr.MS_PER_YEAR, endTimestamp: tr.MS_PER_YEAR }
    })
    const expectedHash = 'hash'
    mockCreateFileWriterMockWith('filePath', expectedHash)

    await generateSnapshotsInMultipleTimeRanges({ database, fs, metrics, logs, staticConfigs, storage, denylist, clock }, oneYearRange)
    expect(storage.delete).toBeCalledWith(expect.arrayContaining(['h1', 'h2']))
    expect(deleteSpy).toBeCalledWith(expect.anything(), expect.arrayContaining(['h1', 'h2']), oneYearRange)
  })

  it('should replace snapshots when they cover the time range', async () => {
    mockStreamedActiveEntitiesWith([
      { entityId: 'id1', entityType: 't1', pointers: ['p1'], entityTimestamp: 0, authChain: [] },
      { entityId: 'id2', entityType: 't2', pointers: ['p2'], entityTimestamp: 1, authChain: [] },
      { entityId: 'id3', entityType: 't3', pointers: ['p3'], entityTimestamp: 2, authChain: [] }
    ])
    const oneYearRange = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR }
    const firstHalfYear = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR / 2 }
    const secondHalfYear = { initTimestamp: tr.MS_PER_YEAR / 2, endTimestamp: tr.MS_PER_YEAR }
    jest.spyOn(snapshotQueries, 'findSnapshotsStrictlyContainedInTimeRange').mockResolvedValue([
      // These two snapshots cover the whole year.
      { hash: 'h1', numberOfEntities: 1, replacedSnapshotHashes: [], timeRange: firstHalfYear, generationTimestamp },
      { hash: 'h2', numberOfEntities: 2, replacedSnapshotHashes: [], timeRange: secondHalfYear, generationTimestamp }
    ])
    jest.spyOn(tr, 'divideTimeInYearsMonthsWeeksAndDays').mockReturnValue({
      intervals: [oneYearRange],
      remainder: { initTimestamp: tr.MS_PER_YEAR, endTimestamp: tr.MS_PER_YEAR }
    })
    const expectedHash = 'hash'
    mockCreateFileWriterMockWith('filePath', expectedHash)

    const snapshots = await generateSnapshotsInMultipleTimeRanges({ database, fs, metrics, logs, staticConfigs, storage, denylist, clock }, oneYearRange)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toEqual({
      hash: expectedHash,
      numberOfEntities: 3,
      replacedSnapshotHashes: ['h1', 'h2'],
      timeRange: oneYearRange,
      generationTimestamp
    })
  })

  it('should not replace snapshots when they do not cover the time range', async () => {
    mockStreamedActiveEntitiesWith([
      { entityId: 'id1', entityType: 't1', pointers: ['p1'], entityTimestamp: 0, authChain: [] },
      { entityId: 'id2', entityType: 't2', pointers: ['p2'], entityTimestamp: 1, authChain: [] },
      { entityId: 'id3', entityType: 't3', pointers: ['p3'], entityTimestamp: 2, authChain: [] }
    ])
    const oneYearRange = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR }
    const firstHalfYear = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR / 2 }
    jest.spyOn(snapshotQueries, 'findSnapshotsStrictlyContainedInTimeRange').mockResolvedValue([
      { hash: 'h1', numberOfEntities: 1, replacedSnapshotHashes: [], timeRange: firstHalfYear, generationTimestamp },
    ])
    jest.spyOn(tr, 'divideTimeInYearsMonthsWeeksAndDays').mockReturnValue({
      intervals: [oneYearRange],
      remainder: { initTimestamp: tr.MS_PER_YEAR, endTimestamp: tr.MS_PER_YEAR }
    })
    const expectedHash = 'hash'
    mockCreateFileWriterMockWith('filePath', expectedHash)

    const snapshots = await generateSnapshotsInMultipleTimeRanges({ database, fs, metrics, logs, staticConfigs, storage, denylist, clock }, oneYearRange)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toEqual({
      hash: expectedHash,
      numberOfEntities: 3,
      replacedSnapshotHashes: [],
      timeRange: oneYearRange,
      generationTimestamp
    })
  })

  it('should not generate snapshot when there is a single snapshot that covers the interval', async () => {
    mockStreamedActiveEntitiesWith([])
    const oneYearRange = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR }
    const expectedSnapshot = { hash: 'h1', numberOfEntities: 1, replacedSnapshotHashes: [], timeRange: oneYearRange, generationTimestamp }
    jest.spyOn(snapshotQueries, 'findSnapshotsStrictlyContainedInTimeRange').mockResolvedValue([expectedSnapshot])
    jest.spyOn(tr, 'divideTimeInYearsMonthsWeeksAndDays').mockReturnValue({
      intervals: [oneYearRange],
      remainder: { initTimestamp: tr.MS_PER_YEAR, endTimestamp: tr.MS_PER_YEAR }
    })
    const expectedHash = 'hash'
    mockCreateFileWriterMockWith('filePath', expectedHash)

    const snapshots = await generateSnapshotsInMultipleTimeRanges({ database, fs, metrics, logs, staticConfigs, storage, denylist, clock }, oneYearRange)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toEqual(expectedSnapshot)
  })

  it('should generate snapshots for per each timespan', async () => {
    mockStreamedActiveEntitiesWith([])
    const oneYearOneMonthOneWeekOneDay = {
      initTimestamp: 0,
      endTimestamp: tr.MS_PER_YEAR + tr.MS_PER_MONTH + tr.MS_PER_WEEK + tr.MS_PER_DAY
    }
    jest.spyOn(snapshotQueries, 'findSnapshotsStrictlyContainedInTimeRange').mockResolvedValue([])
    jest.spyOn(tr, 'divideTimeInYearsMonthsWeeksAndDays').mockReturnValue({
      intervals: [
        { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR },
        { initTimestamp: tr.MS_PER_YEAR, endTimestamp: tr.MS_PER_YEAR + tr.MS_PER_MONTH },
        { initTimestamp: tr.MS_PER_YEAR + tr.MS_PER_MONTH, endTimestamp: tr.MS_PER_YEAR + tr.MS_PER_MONTH + tr.MS_PER_WEEK },
        { initTimestamp: tr.MS_PER_YEAR + tr.MS_PER_MONTH + tr.MS_PER_WEEK, endTimestamp: tr.MS_PER_YEAR + tr.MS_PER_MONTH + tr.MS_PER_WEEK + tr.MS_PER_DAY }
      ],
      remainder: {
        initTimestamp: tr.MS_PER_YEAR + tr.MS_PER_MONTH + tr.MS_PER_WEEK + tr.MS_PER_DAY,
        endTimestamp: tr.MS_PER_YEAR + tr.MS_PER_MONTH + tr.MS_PER_WEEK + tr.MS_PER_DAY
      }
    })
    const expectedHash = 'hash'
    mockCreateFileWriterMockWith('filePath', expectedHash)
    const snapshots = await generateSnapshotsInMultipleTimeRanges({ database, fs, metrics, logs, staticConfigs, storage, denylist, clock }, oneYearOneMonthOneWeekOneDay)
    const baseSnapshot = { hash: expectedHash, numberOfEntities: 0, replacedSnapshotHashes: [], generationTimestamp }
    const yearlySnapshotTimeRange = {
      initTimestamp: 0,
      endTimestamp: tr.MS_PER_YEAR
    }
    const monthlySnapshotTimeRange = {
      initTimestamp: yearlySnapshotTimeRange.endTimestamp,
      endTimestamp: yearlySnapshotTimeRange.endTimestamp + tr.MS_PER_MONTH
    }
    const weeklySnapshotTimeRange = {
      initTimestamp: monthlySnapshotTimeRange.endTimestamp,
      endTimestamp: monthlySnapshotTimeRange.endTimestamp + tr.MS_PER_WEEK
    }
    const dailySnapshotTimeRange = {
      initTimestamp: weeklySnapshotTimeRange.endTimestamp,
      endTimestamp: weeklySnapshotTimeRange.endTimestamp + tr.MS_PER_DAY
    }
    expect(snapshots).toHaveLength(4)
    expect(snapshots[0]).toEqual({ ...baseSnapshot, timeRange: yearlySnapshotTimeRange })
    expect(snapshots[1]).toEqual({ ...baseSnapshot, timeRange: monthlySnapshotTimeRange })
    expect(snapshots[2]).toEqual({ ...baseSnapshot, timeRange: weeklySnapshotTimeRange })
    expect(snapshots[3]).toEqual({ ...baseSnapshot, timeRange: dailySnapshotTimeRange })
  })

  it('should not delete from storage snapshot in other timerange that has the same hash of one of those being replaced', async () => {
    mockStreamedActiveEntitiesWith([])
    const oneYearTimeRange = {
      initTimestamp: 0,
      endTimestamp: tr.MS_PER_YEAR + tr.MS_PER_MONTH
    }
    jest.spyOn(tr, 'divideTimeInYearsMonthsWeeksAndDays').mockReturnValue({
      intervals: [{ initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR }],
      remainder: { initTimestamp: tr.MS_PER_YEAR, endTimestamp: tr.MS_PER_YEAR }
    })
    const expectedHash = 'hash'
    mockCreateFileWriterMockWith('filePath', expectedHash)
    jest.spyOn(snapshotQueries, 'findSnapshotsStrictlyContainedInTimeRange').mockResolvedValue([{
      hash: expectedHash,
      timeRange: { initTimestamp: 0, endTimestamp: tr.MS_PER_MONTH },
      numberOfEntities: 0,
      generationTimestamp
    }])
    jest.spyOn(snapshotQueries, 'getSnapshotHashesNotInTimeRange').mockResolvedValue(new Set([expectedHash]))
    await generateSnapshotsInMultipleTimeRanges({ database, fs, metrics, logs, staticConfigs, storage, denylist, clock }, oneYearTimeRange)
    expect(storage.delete).toBeCalledWith([])
  })
})


function mockCreateFileWriterMockWith(filePath: string, storedHash: string): IFile {
  const fileWriterMock = {
    filePath,
    appendDebounced: jest.fn(),
    close: jest.fn(),
    delete: jest.fn(),
    store: jest.fn().mockResolvedValue(storedHash)
  }
  jest.spyOn(fileWriter, 'createFileWriter').mockResolvedValue(fileWriterMock)
  return fileWriterMock
}

function mockStreamedActiveEntitiesWith(entities: SnapshotSyncDeployment[]) {
  return jest.spyOn(snapshotQueries, 'streamActiveDeploymentsInTimeRange')
    .mockImplementation(async function* gen() {
      for (const entity of entities) {
        yield entity
      }
      return
    })
}
