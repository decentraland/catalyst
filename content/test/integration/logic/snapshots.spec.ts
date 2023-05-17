import { EntityType } from '@dcl/schemas'
import { IBaseComponent } from '@well-known-components/interfaces'
import { DeploymentContext } from '../../../src/deployment-types'
import * as snapshotQueries from '../../../src/logic/database-queries/snapshots-queries'
import { generateSnapshotsInMultipleTimeRanges } from '../../../src/logic/snapshots'
import * as timeRangeLogic from '../../../src/logic/time-range'
import { AppComponents } from '../../../src/types'
import { makeNoopServerValidator, makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { setupTestEnvironment, testCaseWithComponents } from '../E2ETestEnvironment'
import { buildDeployData, EntityCombo } from '../E2ETestUtils'

describe('snapshot generator - ', () => {
  const getTestEnv = setupTestEnvironment()

  const emptySnapshot = {
    hash: 'bafkreig6sfhegnp4okzecgx3v6gj6pohh5qzw6zjtrdqtggx64743rkmz4',
    numberOfEntities: 0,
    replacedSnapshotHashes: []
  }

  const initialTimestamp = 1577836800000

  testCaseWithComponents(getTestEnv, 'should generate snapshot the first time', async (components) => {
    await startSnapshotNeededComponents(components)
    const clockSpy = jest.spyOn(components.clock, 'now')
    const divideTimeSpy = jest.spyOn(timeRangeLogic, 'divideTimeInYearsMonthsWeeksAndDays')

    const timeRange = timeRangeOfDaysFromInitialTimestamp(1)

    const snapshots = await generateSnapshotsInMultipleTimeRanges(components, timeRange)
    expect(divideTimeSpy).toBeCalledWith(timeRange)
    expect(snapshots).toEqual(expect.arrayContaining([expect.objectContaining(emptySnapshot)]))
    if (snapshots) {
      const exist = await components.storage.existMultiple(snapshots.map((s) => s.hash))
      expect(Array.from(exist.values()).every((e) => e)).toBeTruthy()
    }
    expect(clockSpy).toBeCalledTimes(1)
  })

  testCaseWithComponents(
    getTestEnv,
    'should generate the second snapshot but not recreate the first one',
    async (components) => {
      await startSnapshotNeededComponents(components)
      const clockSpy = jest.spyOn(components.clock, 'now')
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(1))
      const snapshots = await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(2))

      expect(snapshots).toEqual(
        expect.arrayContaining([expect.objectContaining(emptySnapshot), expect.objectContaining(emptySnapshot)])
      )
      expect(clockSpy).toBeCalledTimes(2)
    }
  )

  testCaseWithComponents(
    getTestEnv,
    'should generate seven daily snapshots once time each and do not create weekly one yet',
    async (components) => {
      await startSnapshotNeededComponents(components)
      const clockSpy = jest.spyOn(components.clock, 'now')
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(1))
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(2))
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(3))
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(4))
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(5))
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(6))
      const snapshots = await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(7))

      expect(snapshots).toEqual(
        expect.arrayContaining([
          expect.objectContaining(emptySnapshot),
          expect.objectContaining(emptySnapshot),
          expect.objectContaining(emptySnapshot),
          expect.objectContaining(emptySnapshot),
          expect.objectContaining(emptySnapshot),
          expect.objectContaining(emptySnapshot),
          expect.objectContaining(emptySnapshot)
        ])
      )
      // It's called one time every time a snapshot is created
      expect(clockSpy).toBeCalledTimes(7)
    }
  )

  testCaseWithComponents(
    getTestEnv,
    'should generate a weekly snapshot replacing seven daily snapshots and a daily one, at the 8th day',
    async (components) => {
      await startSnapshotNeededComponents(components)
      const clockSpy = jest.spyOn(components.clock, 'now')
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(1))
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(2))
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(3))
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(4))
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(5))
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(6))
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(7))
      const snapshots = await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(8))

      // It's called one time every time a snapshot is created
      // 7 daily + (1 weekly + 1 daily)
      expect(clockSpy).toBeCalledTimes(9)

      const weeklySnapshot = snapshots[0]
      expect(weeklySnapshot).toEqual({
        hash: emptySnapshot.hash,
        timeRange: timeRangeOfDaysFromInitialTimestamp(7),
        numberOfEntities: 0,
        replacedSnapshotHashes: [
          emptySnapshot.hash,
          emptySnapshot.hash,
          emptySnapshot.hash,
          emptySnapshot.hash,
          emptySnapshot.hash,
          emptySnapshot.hash,
          emptySnapshot.hash
        ],
        generationTimestamp: clockSpy.mock.results[7].value
      })
      // daily snapshot
      expect(snapshots[1]).toEqual({
        hash: emptySnapshot.hash,
        timeRange: {
          initTimestamp: weeklySnapshot.timeRange.endTimestamp,
          endTimestamp: timeRangeOfDaysFromInitialTimestamp(8).endTimestamp
        },
        numberOfEntities: 0,
        replacedSnapshotHashes: [],
        generationTimestamp: clockSpy.mock.results[8].value
      })
      // It's called one time every time a snapshot is created
      // 7 daily + (1 weekly + 1 daily)
      expect(clockSpy).toBeCalledTimes(9)
    }
  )

  testCaseWithComponents(
    getTestEnv,
    'should generate a weekly snapshot and do not replace the daily ones if they are not 7, at the 8th day',
    async (components) => {
      await startSnapshotNeededComponents(components)
      const clockSpy = jest.spyOn(components.clock, 'now')
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(1))
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(2))
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(3))
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(4))
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(5))
      // now we supose the server is down for a few days, so 6th and 7th daily snapshots are not generated
      const snapshots = await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(8))

      // It's called one time every time a snapshot is created
      // 5 daily + (1 weekly + 1 daily)
      expect(clockSpy).toBeCalledTimes(7)

      const weeklySnapshot = snapshots[0]
      expect(weeklySnapshot).toEqual({
        hash: emptySnapshot.hash,
        timeRange: timeRangeOfDaysFromInitialTimestamp(7),
        numberOfEntities: 0,
        replacedSnapshotHashes: [],
        generationTimestamp: clockSpy.mock.results[5].value
      })
      // daily snapshot
      expect(snapshots[1]).toEqual({
        hash: emptySnapshot.hash,
        timeRange: {
          initTimestamp: weeklySnapshot.timeRange.endTimestamp,
          endTimestamp: timeRangeOfDaysFromInitialTimestamp(8).endTimestamp
        },
        numberOfEntities: 0,
        replacedSnapshotHashes: [],
        generationTimestamp: clockSpy.mock.results[6].value
      })
    }
  )

  testCaseWithComponents(
    getTestEnv,
    'should put entities to the corresponding snapshot based on the deploy time (localTimestamp)',
    async (components) => {
      makeNoopServerValidator(components)
      makeNoopValidator(components)
      await startSnapshotNeededComponents(components)
      // deploy entity for the 1st snapshot
      await deployAnEntityAtTimestamp(components, '0x00000', daysAfterInitialTimestamp(0) + 1)

      // deploy entity for the 2nd snapshot
      await deployAnEntityAtTimestamp(components, '0x00001', daysAfterInitialTimestamp(1) + 1)

      // deploy entity for the 3rd snapshot
      await deployAnEntityAtTimestamp(components, '0x00002', daysAfterInitialTimestamp(2) + 1)

      // do not deploy anything until the 7th day
      // deploy entity for the 7nd snapshot
      await deployAnEntityAtTimestamp(components, '0x00007', daysAfterInitialTimestamp(6) + 1)

      const snapshots = await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(7))
      expect(snapshots).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ numberOfEntities: 1 }),
          expect.objectContaining({ numberOfEntities: 1 }),
          expect.objectContaining({ numberOfEntities: 1 }),
          expect.objectContaining({ numberOfEntities: 0 }),
          expect.objectContaining({ numberOfEntities: 0 }),
          expect.objectContaining({ numberOfEntities: 0 }),
          expect.objectContaining({ numberOfEntities: 1 })
        ])
      )
    }
  )

  testCaseWithComponents(
    getTestEnv,
    'should include in the weekly snapshot the entities of the replaced snapshots',
    async (components) => {
      makeNoopServerValidator(components)
      makeNoopValidator(components)
      await startSnapshotNeededComponents(components)
      // deploy entity for the 1st snapshot
      await deployAnEntityAtTimestamp(components, '0x00000', daysAfterInitialTimestamp(0) + 1)

      // deploy entity for the 2nd snapshot
      await deployAnEntityAtTimestamp(components, '0x00001', daysAfterInitialTimestamp(1) + 1)

      // deploy entity for the 3rd snapshot
      await deployAnEntityAtTimestamp(components, '0x00002', daysAfterInitialTimestamp(2) + 1)

      // do not deploy anything until the 7th day
      // deploy entity for the 7nd snapshot
      await deployAnEntityAtTimestamp(components, '0x00007', daysAfterInitialTimestamp(6) + 1)

      const snapshots = await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(8))
      expect(snapshots).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ numberOfEntities: 4 }),
          expect.objectContaining({ numberOfEntities: 0 })
        ])
      )
    }
  )

  testCaseWithComponents(getTestEnv, 'should not include inactive entities in snapshots', async (components) => {
    makeNoopServerValidator(components)
    makeNoopValidator(components)
    await startSnapshotNeededComponents(components)
    // deploy entity for the 1st snapshot
    await deployAnEntityAtTimestamp(components, '0x00000', daysAfterInitialTimestamp(0) + 1)

    // deploy entity for the 1st snapshot with the same pointer and overwrite the pointer
    await deployAnEntityAtTimestamp(components, '0x00000', daysAfterInitialTimestamp(0) + 1)

    const snapshots = await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(1))
    expect(snapshots).toEqual(expect.arrayContaining([expect.objectContaining({ numberOfEntities: 1 })]))
  })

  testCaseWithComponents(getTestEnv, 'should recreate the snapshot if it is not stored', async (components) => {
    makeNoopServerValidator(components)
    makeNoopValidator(components)
    await startSnapshotNeededComponents(components)

    await deployAnEntityAtTimestamp(components, '0x00000', daysAfterInitialTimestamp(0) + 1)

    const storeSpy = jest.spyOn(components.storage, 'storeStreamAndCompress')

    // snapshot is generated and assert is correctly stored
    const snapshots = await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(1))

    expect(snapshots).toEqual(expect.arrayContaining([expect.objectContaining({ numberOfEntities: 1 })]))
    expect(storeSpy).toBeCalledWith(snapshots[0].hash, expect.anything())
    expect(await components.storage.exist(snapshots[0].hash)).toBeTruthy()

    // now the snapshot is deleted from storage so it needs to be re-generated
    storeSpy.mockClear()
    await components.storage.delete([snapshots[0].hash])
    expect(await components.storage.exist(snapshots[0].hash)).toBeFalsy()

    // now the snapshot is re-generated and stored again
    const snapshots2 = await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(1))
    expect(snapshots2).toEqual(expect.arrayContaining([expect.objectContaining({ numberOfEntities: 1 })]))
    expect(storeSpy).toBeCalledWith(snapshots2[0].hash, expect.anything())
    expect(await components.storage.exist(snapshots2[0].hash)).toBeTruthy()
  })

  testCaseWithComponents(
    getTestEnv,
    'should not delete replaced snapshot if it is used in another timerange',
    async (components) => {
      makeNoopServerValidator(components)
      makeNoopValidator(components)
      await startSnapshotNeededComponents(components)

      await deployAnEntityAtTimestamp(components, '0x00000', daysAfterInitialTimestamp(0) + 1)

      jest.spyOn(snapshotQueries, 'findSnapshotsStrictlyContainedInTimeRange').mockResolvedValue([
        {
          hash: 'h1',
          replacedSnapshotHashes: [],
          numberOfEntities: 5,
          timeRange: { initTimestamp: 1, endTimestamp: 2 },
          generationTimestamp: 1
        }
      ])

      // the re-generation is forced
      jest.spyOn(snapshotQueries, 'snapshotIsOutdated').mockResolvedValue(true)
      const snapshotsNotInTimeRangeSpy = jest
        .spyOn(snapshotQueries, 'getSnapshotHashesNotInTimeRange')
        .mockResolvedValue(new Set(['h1']))

      // snapshot is generated and assert is correctly stored
      const snapshots = await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(1))

      expect(snapshots).toEqual(expect.arrayContaining([expect.objectContaining({ numberOfEntities: 1 })]))
      expect(await components.storage.exist(snapshots[0].hash)).toBeTruthy()
      expect(snapshotsNotInTimeRangeSpy).toBeCalledWith(
        expect.anything(),
        expect.arrayContaining(['h1']),
        expect.anything()
      )
    }
  )

  testCaseWithComponents(
    getTestEnv,
    'should not delete from db nor storage a snapshot in other timerange that has the same hash of one of those being replaced',
    async (components) => {
      makeNoopServerValidator(components)
      makeNoopValidator(components)
      await startSnapshotNeededComponents(components)
      // 14 empty days generates 1 weekly empty snapshots and 7 daily empty snapshot
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(14))

      // deploy entity for the last daily snapshot
      await deployAnEntityAtTimestamp(components, '0x00000', daysAfterInitialTimestamp(14) + 1)
      // 15 empty days generates 2 weekly empty snapshots and 1 daily empty snapshot:
      //  - The first weekly snapshot is already created with no deployments.
      //  - The second weekly snapshot will replace the 7 daily ones, that are empty, so they have the same hash of the first weekly snapshot
      //  - The last the daily snapshot, has a different snapshot hash as it has one deployment.
      await generateSnapshotsInMultipleTimeRanges(components, timeRangeOfDaysFromInitialTimestamp(15))
      // expect first week snapshot to be present
      const snapshots = await snapshotQueries.findSnapshotsStrictlyContainedInTimeRange(
        components.database,
        timeRangeOfDaysFromInitialTimestamp(15)
      )
      expect(snapshots[0].timeRange).toEqual(timeRangeOfDaysFromInitialTimestamp(7))
      const hashesExist = await components.storage.existMultiple(snapshots.map((s) => s.hash))
      expect(Array.from(hashesExist.values()).every((e) => e)).toBeTruthy()
    }
  )

  testCaseWithComponents(
    getTestEnv,
    'should re-generate snapshot if it is outdated (an entity for the time range was deployed after the generation timestamp of the snapshot)',
    async (components) => {
      makeNoopServerValidator(components)
      makeNoopValidator(components)
      await startSnapshotNeededComponents(components)

      const firstDayTimeRange = timeRangeOfDaysFromInitialTimestamp(1)
      // first a snapshot is generated for the first day, with a generationTimestamp older than a month
      const oldSnapshot = {
        hash: 'aHash',
        timeRange: firstDayTimeRange,
        numberOfEntities: 0,
        generationTimestamp: firstDayTimeRange.endTimestamp + 1
      }
      await snapshotQueries.saveSnapshot(components.database, oldSnapshot)

      jest.spyOn(components.storage, 'existMultiple').mockImplementation(async (hashes) => {
        const e = new Map()
        for (const h of hashes) e.set(h, true)
        return e
      })

      // an entity is deployed in the time range of the snapshot but with local timestamp after the snapshot generation
      // so the snapshot becomes outdated
      await deployAnEntityAtTimestamp(
        components,
        '0x00000',
        daysAfterInitialTimestamp(0) + 1,
        oldSnapshot.generationTimestamp + 1
      )
      const snapshots = await generateSnapshotsInMultipleTimeRanges(components, firstDayTimeRange)

      expect(snapshots).toHaveLength(1)
      const snapshot = snapshots[0]
      expect(snapshot.hash).not.toEqual('aHash')
      expect(snapshot.timeRange).toEqual(firstDayTimeRange)
      expect(snapshot.numberOfEntities).toEqual(1)
      expect(snapshot.generationTimestamp).toBeGreaterThan(oldSnapshot.generationTimestamp)
      expect(snapshot.replacedSnapshotHashes).toEqual(expect.arrayContaining([]))
    }
  )

  testCaseWithComponents(
    getTestEnv,
    'should re-generate snapshot if it has inactive entities and is older than a month (and replace the old one)',
    async (components) => {
      makeNoopServerValidator(components)
      makeNoopValidator(components)
      await startSnapshotNeededComponents(components)

      const firstDayTimeRange = timeRangeOfDaysFromInitialTimestamp(1)

      await deployAnEntityAtTimestamp(components, '0x00000', daysAfterInitialTimestamp(0) + 1)
      const snapshots = await generateSnapshotsInMultipleTimeRanges(components, firstDayTimeRange)
      expect(snapshots).toEqual(
        expect.arrayContaining([expect.objectContaining({ numberOfEntities: 1, timeRange: firstDayTimeRange })])
      )

      // now and entity with the same pointer is deployed but for outside the original timeRange
      // so now the entity in the previous snapshot is inactive
      await deployAnEntityAtTimestamp(
        components,
        '0x00000',
        daysAfterInitialTimestamp(2),
        daysAfterInitialTimestamp(30)
      )
      const snapshots2 = await generateSnapshotsInMultipleTimeRanges(components, firstDayTimeRange)
      expect(snapshots2).toEqual(
        expect.arrayContaining([expect.objectContaining({ numberOfEntities: 0, timeRange: firstDayTimeRange })])
      )
      expect(snapshots2[0].hash).not.toEqual(snapshots[0].hash)
      expect(snapshots2[0].replacedSnapshotHashes).toEqual(expect.arrayContaining([snapshots[0].hash]))
    }
  )

  function timeRangeOfDaysFromInitialTimestamp(numberOfDays: number) {
    return {
      initTimestamp: initialTimestamp,
      endTimestamp: daysAfterInitialTimestamp(numberOfDays)
    }
  }

  function daysAfterInitialTimestamp(numberOfDays) {
    return initialTimestamp + timeRangeLogic.MS_PER_DAY * numberOfDays
  }
})

async function startComponent(component: IBaseComponent, startOptions: IBaseComponent.ComponentStartOptions) {
  if (component.start) await component.start(startOptions)
}

async function startSnapshotNeededComponents(
  components: Pick<
    AppComponents,
    'database' | 'fs' | 'metrics' | 'storage' | 'logs' | 'denylist' | 'staticConfigs' | 'clock'
  >
) {
  const startOptions = { started: jest.fn(), live: jest.fn(), getComponents: jest.fn() }
  await startComponent(components.database, startOptions)
  await startComponent(components.fs as IBaseComponent, startOptions)
  await startComponent(components.metrics as IBaseComponent, startOptions)
  await startComponent(components.storage as IBaseComponent, startOptions)
  await startComponent(components.logs as IBaseComponent, startOptions)
  await startComponent(components.denylist as IBaseComponent, startOptions)
  await startComponent(components.staticConfigs as IBaseComponent, startOptions)
}

async function deployAnEntityAtTimestamp(
  components: Pick<AppComponents, 'deployer' | 'clock'>,
  pointer: string,
  entityTimestamp: number,
  localTimestamp?: number
) {
  jest.spyOn(components.clock, 'now').mockReturnValue(localTimestamp ?? entityTimestamp)
  const anEntity: EntityCombo = await buildDeployData([pointer], {
    type: EntityType.PROFILE,
    timestamp: entityTimestamp,
    metadata: { a: 'metadata' }
  })
  await components.deployer.deployEntity(
    Array.from(anEntity.deployData.files.values()),
    anEntity.deployData.entityId,
    { authChain: anEntity.deployData.authChain },
    DeploymentContext.LOCAL
  )
}
