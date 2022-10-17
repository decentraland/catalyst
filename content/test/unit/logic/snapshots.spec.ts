import { DeploymentWithAuthChain } from '@dcl/schemas'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import * as snapshotQueries from '../../../src/logic/database-queries/snapshots-queries'
import { generateAndStoreSnapshot, generateSnapshotsInMultipleTimeRanges } from '../../../src/logic/snapshots'
import * as tr from '../../../src/logic/time-range'
import { metricsDeclaration } from '../../../src/metrics'
import { ContentStorage } from '../../../src/ports/contentStorage/contentStorage'
import { Denylist } from '../../../src/ports/denylist'
import * as fileWriter from '../../../src/ports/fileWriter'
import { IFile } from '../../../src/ports/fileWriter'
import { createFsComponent } from '../../../src/ports/fs'
import { createTestDatabaseComponent } from '../../../src/ports/postgres'

describe('generate snapshot', () => {

  const database = createTestDatabaseComponent()
  const fs = createFsComponent()
  const metrics = createTestMetricsComponent(metricsDeclaration)
  const staticConfigs = { contentStorageFolder: '', tmpDownloadFolder: '' }
  const denylist: Denylist = { isDenylisted: jest.fn() }
  const aTimeRange = { initTimestamp: 1, endTimestamp: 2 }
  let storage: ContentStorage
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

  it('should append no denylisted active entities', async () => {
    mockStreamedActiveEntitiesWith([
      { entityId: 'id1', entityType: 't1', pointers: ['p1'], localTimestamp: 0, authChain: [] },
      { entityId: 'id2', entityType: 't2', pointers: ['p2'], localTimestamp: 1, authChain: [] }
    ])
    const fileWriterMock = mockCreateFileWriterMockWith('filePath', 'aHash')
    await generateAndStoreSnapshot({ database, fs, metrics, logs, staticConfigs, storage, denylist, }, aTimeRange)
    expect(fileWriterMock.appendDebounced).toBeCalledWith('### Decentraland json snapshot\n')
    expect(fileWriterMock.appendDebounced)
      .toBeCalledWith('{"entityId":"id1","entityType":"t1","pointers":["p1"],"localTimestamp":0,"authChain":[]}\n')
    expect(fileWriterMock.appendDebounced)
      .toBeCalledWith('{"entityId":"id2","entityType":"t2","pointers":["p2"],"localTimestamp":1,"authChain":[]}\n')
    expect(fileWriterMock.appendDebounced).toBeCalledTimes(3)
  })

  it('should append only no denylisted active entities', async () => {
    mockStreamedActiveEntitiesWith([
      { entityId: 'id1', entityType: 't1', pointers: ['p1'], localTimestamp: 0, authChain: [] },
      { entityId: 'id2', entityType: 't2', pointers: ['p2'], localTimestamp: 1, authChain: [] },
      { entityId: 'id3', entityType: 't3', pointers: ['p3'], localTimestamp: 2, authChain: [] }
    ])
    const fileWriterMock = mockCreateFileWriterMockWith('filePath', 'aHash')
    const denylist = {
      isDenylisted: jest.fn().mockImplementation((id) => id == 'id3')
    }
    await generateAndStoreSnapshot({ database, fs, metrics, logs, staticConfigs, storage, denylist }, aTimeRange)
    expect(fileWriterMock.appendDebounced).toBeCalledWith('### Decentraland json snapshot\n')
    expect(fileWriterMock.appendDebounced)
      .toBeCalledWith('{"entityId":"id1","entityType":"t1","pointers":["p1"],"localTimestamp":0,"authChain":[]}\n')
    expect(fileWriterMock.appendDebounced)
      .toBeCalledWith('{"entityId":"id2","entityType":"t2","pointers":["p2"],"localTimestamp":1,"authChain":[]}\n')
    expect(fileWriterMock.appendDebounced).toBeCalledTimes(3)
  })

  it('should return snapshot hash and total number of no denylisted entities', async () => {
    mockStreamedActiveEntitiesWith([
      { entityId: 'id1', entityType: 't1', pointers: ['p1'], localTimestamp: 0, authChain: [] },
      { entityId: 'id2', entityType: 't2', pointers: ['p2'], localTimestamp: 1, authChain: [] },
      { entityId: 'id3', entityType: 't3', pointers: ['p3'], localTimestamp: 2, authChain: [] }
    ])
    const expectedSnapshotHash = 'aHash'
    mockCreateFileWriterMockWith('filePath', expectedSnapshotHash)
    const denylist = {
      isDenylisted: jest.fn().mockImplementation((id) => id == 'id3')
    }
    const { hash, numberOfEntities } =
      await generateAndStoreSnapshot({ database, fs, metrics, logs, staticConfigs, storage, denylist }, aTimeRange)
    expect(hash).toEqual(expectedSnapshotHash)
    expect(numberOfEntities).toEqual(2)
  })
})

describe('generate snapshot in multiple', () => {

  const database = createTestDatabaseComponent()
  const fs = createFsComponent()
  const metrics = createTestMetricsComponent(metricsDeclaration)
  const staticConfigs = { contentStorageFolder: '', tmpDownloadFolder: '' }
  const denylist: Denylist = { isDenylisted: jest.fn() }
  const clock = { now: Date.now }
  const storage: ContentStorage = {
    storeStream: jest.fn(),
    storeStreamAndCompress: jest.fn(),
    delete: jest.fn(),
    retrieve: jest.fn(),
    exist: jest.fn(),
    existMultiple: jest.fn(),
    allFileIds: jest.fn()
  }
  let logs: ILoggerComponent
  const saveFn = snapshotQueries.saveSnapshot
  const deleteFn = snapshotQueries.deleteSnapshots
  let saveSpy: jest.SpyInstance<ReturnType<typeof saveFn>, Parameters<typeof saveFn>>
  let deleteSpy: jest.SpyInstance<ReturnType<typeof deleteFn>, Parameters<typeof deleteFn>>

  beforeAll(async () => {
    logs = await createLogComponent({ config: createConfigComponent({ LOG_LEVEL: 'DEBUG' }) })
  })

  beforeEach(() => {
    jest.restoreAllMocks()
    jest.spyOn(database, 'transaction').mockImplementation(async (f) => { await f(database) })
    saveSpy = jest.spyOn(snapshotQueries, 'saveSnapshot').mockImplementation()
    deleteSpy = jest.spyOn(snapshotQueries, 'deleteSnapshots').mockImplementation()
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
      timeRange: oneYearRange
    })
  })

  it('should generate snapshot when there are multiple snapshots that cover the interval', async () => {
    mockStreamedActiveEntitiesWith([])
    const oneYearRange = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR }
    const firstHalfYear = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR / 2 }
    const secondHalfYear = { initTimestamp: tr.MS_PER_YEAR / 2, endTimestamp: tr.MS_PER_YEAR }
    jest.spyOn(snapshotQueries, 'findSnapshotsStrictlyContainedInTimeRange').mockResolvedValue([
      { hash: 'h1', numberOfEntities: 1, replacedSnapshotHashes: [], timeRange: firstHalfYear },
      { hash: 'h2', numberOfEntities: 2, replacedSnapshotHashes: [], timeRange: secondHalfYear }
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
      timeRange: oneYearRange
    }

    const snapshots = await generateSnapshotsInMultipleTimeRanges({ database, fs, metrics, logs, staticConfigs, storage, denylist, clock }, oneYearRange)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toEqual(expectedSnapshot)
    expect(storage.delete).toBeCalledWith(expect.arrayContaining(expectedReplacedHashes))
    expect(deleteSpy).toBeCalledWith(expect.anything(), expect.arrayContaining(expectedReplacedHashes))
    expect(saveSpy).toBeCalledWith(expect.anything(), expectedSnapshot, expect.anything())
  })

  it('should delete old snapshots within the interval of the new snapshot generated', async () => {
    mockStreamedActiveEntitiesWith([])
    const oneYearRange = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR }
    const timeRangeWithinTheYear = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR / 2 }
    jest.spyOn(snapshotQueries, 'findSnapshotsStrictlyContainedInTimeRange').mockResolvedValue([
      { hash: 'h1', numberOfEntities: 1, replacedSnapshotHashes: [], timeRange: timeRangeWithinTheYear },
    ])
    const expectedHash = 'hash'
    mockCreateFileWriterMockWith('filePath', expectedHash)

    await generateSnapshotsInMultipleTimeRanges({ database, fs, metrics, logs, staticConfigs, storage, denylist, clock }, oneYearRange)
    expect(storage.delete).toBeCalledWith(expect.arrayContaining(['h1']))
    expect(deleteSpy).toBeCalledWith(expect.anything(), expect.arrayContaining(['h1']))
  })

  it('should delete snapshots when they are replaced', async () => {
    mockStreamedActiveEntitiesWith([])
    const oneYearRange = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR }
    const firstHalfYear = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR / 2 }
    const secondHalfYear = { initTimestamp: tr.MS_PER_YEAR / 2, endTimestamp: tr.MS_PER_YEAR }
    jest.spyOn(snapshotQueries, 'findSnapshotsStrictlyContainedInTimeRange').mockResolvedValue([
      { hash: 'h1', numberOfEntities: 1, replacedSnapshotHashes: [], timeRange: firstHalfYear },
      { hash: 'h2', numberOfEntities: 2, replacedSnapshotHashes: [], timeRange: secondHalfYear }
    ])
    const expectedHash = 'hash'
    mockCreateFileWriterMockWith('filePath', expectedHash)

    await generateSnapshotsInMultipleTimeRanges({ database, fs, metrics, logs, staticConfigs, storage, denylist, clock }, oneYearRange)
    expect(storage.delete).toBeCalledWith(expect.arrayContaining(['h1', 'h2']))
    expect(deleteSpy).toBeCalledWith(expect.anything(), expect.arrayContaining(['h1', 'h2']))
  })

  it('should replace snapshots when they cover the time range', async () => {
    mockStreamedActiveEntitiesWith([
      { entityId: 'id1', entityType: 't1', pointers: ['p1'], localTimestamp: 0, authChain: [] },
      { entityId: 'id2', entityType: 't2', pointers: ['p2'], localTimestamp: 1, authChain: [] },
      { entityId: 'id3', entityType: 't3', pointers: ['p3'], localTimestamp: 2, authChain: [] }
    ])
    const oneYearRange = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR }
    const firstHalfYear = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR / 2 }
    const secondHalfYear = { initTimestamp: tr.MS_PER_YEAR / 2, endTimestamp: tr.MS_PER_YEAR }
    jest.spyOn(snapshotQueries, 'findSnapshotsStrictlyContainedInTimeRange').mockResolvedValue([
      // These two snapshots cover the whole year.
      { hash: 'h1', numberOfEntities: 1, replacedSnapshotHashes: [], timeRange: firstHalfYear },
      { hash: 'h2', numberOfEntities: 2, replacedSnapshotHashes: [], timeRange: secondHalfYear }
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
      timeRange: oneYearRange
    })
  })

  it('should not replace snapshots when they do not cover the time range', async () => {
    mockStreamedActiveEntitiesWith([
      { entityId: 'id1', entityType: 't1', pointers: ['p1'], localTimestamp: 0, authChain: [] },
      { entityId: 'id2', entityType: 't2', pointers: ['p2'], localTimestamp: 1, authChain: [] },
      { entityId: 'id3', entityType: 't3', pointers: ['p3'], localTimestamp: 2, authChain: [] }
    ])
    const oneYearRange = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR }
    const firstHalfYear = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR / 2 }
    jest.spyOn(snapshotQueries, 'findSnapshotsStrictlyContainedInTimeRange').mockResolvedValue([
      { hash: 'h1', numberOfEntities: 1, replacedSnapshotHashes: [], timeRange: firstHalfYear },
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
      timeRange: oneYearRange
    })
  })

  it('should not generate snapshot when there is a single snapshot that covers the interval', async () => {
    mockStreamedActiveEntitiesWith([])
    const oneYearRange = { initTimestamp: 0, endTimestamp: tr.MS_PER_YEAR }
    const expectedSnapshot = { hash: 'h1', numberOfEntities: 1, replacedSnapshotHashes: [], timeRange: oneYearRange }
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
    const baseSnapshot = { hash: expectedHash, numberOfEntities: 0, replacedSnapshotHashes: [] }
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

function mockStreamedActiveEntitiesWith(entities: DeploymentWithAuthChain[]) {
  return jest.spyOn(snapshotQueries, 'streamActiveDeploymentsInTimeRange')
    .mockImplementation(async function* gen() {
      for (const entity of entities) {
        yield entity
      }
      return
    })
}
