import * as loggerComponent from '@well-known-components/logger'
import SQL from 'sql-template-strings'
import { Deployment } from '../../../src/deployment-types'
import {
  findSnapshotsStrictlyContainedInTimeRange,
  getProcessedSnapshots
} from '../../../src/logic/database-queries/snapshots-queries'
import { getDeployments } from '../../../src/logic/deployments'
import * as timeRangeLogic from '../../../src/logic/time-range'
import { assertDeploymentsAreReported, buildDeployment } from '../E2EAssertions'
import { setupTestEnvironment } from '../E2ETestEnvironment'
import { buildDeployData } from '../E2ETestUtils'
import { startProgramAndWaitUntilBootstrapFinishes, TestProgram } from '../TestProgram'

describe('Bootstrapping synchronization tests', function () {
  const getTestEnv = setupTestEnvironment()
  let server1: TestProgram, server2: TestProgram
  const initialTimestamp = 1577836800000

  let loggerIndex = 1

  beforeAll(() => {
    const originalCreateLogComponent = loggerComponent.createLogComponent
    jest.spyOn(loggerComponent, 'createLogComponent').mockImplementation(async (components) => {
      const logComponent = await originalCreateLogComponent(components)
      const originalGetLogger = logComponent.getLogger
      const assignedLoggerIndex = loggerIndex
      logComponent.getLogger = (loggerName) => originalGetLogger(`server${assignedLoggerIndex}/${loggerName}`)
      loggerIndex++
      return logComponent
    })
  })

  let fakeNow: () => number
  let baseTimestamp = 0

  beforeEach(async () => {
    ;[server1, server2] = await getTestEnv().configServer().andBuildMany(2)

    const now = Date.now()
    baseTimestamp = 0
    fakeNow = () => Date.now() - now + initialTimestamp + baseTimestamp
    jest.spyOn(server1.components.clock, 'now').mockImplementation(fakeNow)
    jest.spyOn(server2.components.clock, 'now').mockImplementation(fakeNow)
    jest.spyOn(server1.components.validator, 'validate').mockResolvedValue({ ok: true })
    jest.spyOn(server2.components.validator, 'validate').mockResolvedValue({ ok: true })
    loggerIndex = 1
  })

  it('when a server bootstraps, it should processed the snapshots of other servers', async () => {
    // it should create 7 daily empty snapshots starting at initialTimestamp
    advanceTime(timeRangeLogic.MS_PER_WEEK)
    await server1.startProgram()

    jest.spyOn(server2.components.snapshotStorage, 'has').mockResolvedValue(false)
    await startProgramAndWaitUntilBootstrapFinishes(server2)

    // once the bootstrap from snapshots finished, it should have processed the server1 snapshots.
    const server1Snapshots: Set<string> = new Set(
      (
        await server1.components.database.queryWithValues<{ hash: string }>(SQL`SELECT DISTINCT hash from snapshots;`)
      ).rows.map((s) => s.hash)
    )

    const server2ProcessedSnapshots = await getProcessedSnapshots(
      server2.components.database,
      Array.from(server1Snapshots)
    )
    expect(server1Snapshots.size > 0).toBeTruthy()
    expect(server2ProcessedSnapshots).toEqual(server1Snapshots)
  })

  it('when a server process a snapshot, it deploys the entities inside it', async () => {
    // it should create 7 daily empty snapshots starting at initialTimestamp
    await server1.startProgram()

    // deploy an entity to server 1
    const deployment = await deployEntityAtTimestamp(server1, 'p1', fakeNow() + 1)

    // Assert that the entity was deployed on server 1
    await assertDeploymentsAreReported(server1, deployment)

    // now restart the snapshot generator and advance the time one day so it creates a new daily snapshot and includes the last deployment
    if (server1.components.snapshotGenerator.stop) await server1.components.snapshotGenerator.stop()
    // we advance the clock 1 day so the new daily snapshot is created
    advanceTime(timeRangeLogic.MS_PER_DAY)
    if (server1.components.snapshotGenerator.start)
      await server1.components.snapshotGenerator.start({
        started: jest.fn(),
        live: jest.fn(),
        getComponents: jest.fn()
      })

    // now we start a new server 2 and expect that after bootstrap, it processed all the snapshots from server 1
    await startProgramAndWaitUntilBootstrapFinishes(server2)

    // now we assert the server 2 processed all the server 1 snapshots; it's in the db and the deployment inside were deployed
    const server1snapshots = await server1.components.database.queryWithValues<{ hash: string }>(
      SQL`SELECT DISTINCT hash from snapshots ORDER BY hash;`
    )
    const server2processedSnapshots = await server2.components.database.queryWithValues<{ hash: string }>(
      SQL`SELECT DISTINCT hash from processed_snapshots ORDER BY hash;`
    )
    expect(server1snapshots.rows).toEqual(server2processedSnapshots.rows)
    // Assert that the entity was deployed on server 2
    await assertDeploymentsAreReported(server2, deployment)
  })

  it('when a server process a snapshot with replaced hashes and it has already processed all of them, it should add the new one in the db, and do not process its entities again', async () => {
    // it should not create snapshots
    await server1.startProgram()

    // deploy entity in the first day
    const deployment1 = await deployEntityAtTimestamp(server1, 'p1', fakeNow() + 1)

    // deploy entity in the second day
    advanceTime(timeRangeLogic.MS_PER_DAY)
    const deployment2 = await deployEntityAtTimestamp(server1, 'p2', fakeNow() + 1)

    await assertDeploymentsAreReported(server1, deployment1, deployment2)

    // now we advance the clock to the first week, and run the snapshot generation so it generates 7 daily snapshots
    // the first one and the second one with entities, the other 5 empty snapshots
    if (server1.components.snapshotGenerator.stop) await server1.components.snapshotGenerator.stop()
    advanceTime(6 * timeRangeLogic.MS_PER_DAY)
    if (server1.components.snapshotGenerator.start)
      await server1.components.snapshotGenerator.start({
        started: jest.fn(),
        live: jest.fn(),
        getComponents: jest.fn()
      })

    // now we start a new server 2 so it processes the 3 snapshots: the first one, the second one and the 5 empty ones (only one of these processed)
    const markSnapshotAsProcessedSpy = jest.spyOn(
      server2.components.processedSnapshotStorage,
      'markSnapshotAsProcessed'
    )
    jest.spyOn(server2.components.snapshotStorage, 'has').mockResolvedValue(false)
    await startProgramAndWaitUntilBootstrapFinishes(server2)
    const sevenDaysSnapshots = await findSnapshotsStrictlyContainedInTimeRange(server1.components.database, {
      initTimestamp: initialTimestamp,
      endTimestamp: fakeNow()
    })
    expect(sevenDaysSnapshots).toHaveLength(7)
    expect(markSnapshotAsProcessedSpy).toBeCalledTimes(3)
    for (const snapshotHash of sevenDaysSnapshots.map((s) => s.hash)) {
      expect(markSnapshotAsProcessedSpy).toBeCalledWith(snapshotHash)
    }

    // now we deploy a new entity for the 8th day
    const deployment3 = await deployEntityAtTimestamp(server1, 'p3', fakeNow() + 1)
    await assertDeploymentsAreReported(server1, deployment1, deployment2, deployment3)

    // now we advance the clock one day more, 8 days passed, it will generate 1 weekly snapshot (replacing the first 7)
    // and a new daily one for the 8th day
    advanceTime(timeRangeLogic.MS_PER_DAY)
    if (server1.components.snapshotGenerator.stop) await server1.components.snapshotGenerator.stop()
    if (server1.components.snapshotGenerator.start)
      await server1.components.snapshotGenerator.start({
        started: jest.fn(),
        live: jest.fn(),
        getComponents: jest.fn()
      })

    // now we run the sync from snapshots again in server 2 (would be nice to have a mechanism to restart the server)
    // it should save the weekly snapshot as already processed as it already processed the 7 ones that it's replacing
    // it should process only the last empty daily snapshot
    markSnapshotAsProcessedSpy.mockReset()
    // await server2.components.synchronizer.syncSnapshotsForSyncingServers()
    await (await server2.components.synchronizer.syncWithServers(new Set())).onSyncFinished()
    await (
      await server2.components.synchronizer.syncWithServers(
        new Set(server2.components.contentCluster.getAllServersInCluster())
      )
    ).onSyncFinished()
    await server2.components.downloadQueue.onIdle()
    await server2.components.batchDeployer.onIdle()
    const eightDaysSnapshots = await findSnapshotsStrictlyContainedInTimeRange(server1.components.database, {
      initTimestamp: initialTimestamp,
      endTimestamp: fakeNow()
    })
    expect(eightDaysSnapshots).toHaveLength(2)
    const oldSnapshots = new Set(sevenDaysSnapshots)
    for (const newSnapshotHash of eightDaysSnapshots) {
      expect(oldSnapshots.has(newSnapshotHash)).toBeFalsy()
    }
    expect(markSnapshotAsProcessedSpy).toBeCalledTimes(2)
    for (const snapshotHash of eightDaysSnapshots.map((s) => s.hash)) {
      expect(markSnapshotAsProcessedSpy).toBeCalledWith(snapshotHash)
    }
  })

  it('when a server bootstraps, it should persist failed deployments but mark as processed the snapshots', async () => {
    jest
      .spyOn(server2.components.validator, 'validate')
      .mockResolvedValue({ ok: false, errors: ['error set in the test'] })

    // it should create 7 daily empty snapshots starting at initialTimestamp
    await server1.startProgram()

    // deploy an entity to server 1
    const deployment = await deployEntityAtTimestamp(server1, 'p1', fakeNow() + 1)

    // Assert that the entity was deployed on server 1
    await assertDeploymentsAreReported(server1, deployment)

    // now restart the snapshot generator and advance the time one day so it creates a new daily snapshot and includes the last deployment
    if (server1.components.snapshotGenerator.stop) await server1.components.snapshotGenerator.stop()
    // we advance the clock 1 day so the new daily snapshot is created
    advanceTime(timeRangeLogic.MS_PER_DAY)
    if (server1.components.snapshotGenerator.start)
      await server1.components.snapshotGenerator.start({
        started: jest.fn(),
        live: jest.fn(),
        getComponents: jest.fn()
      })

    // now we start a new server 2 and expect that after bootstrap, it processed all the snapshots from server 1
    await startProgramAndWaitUntilBootstrapFinishes(server2)

    // now we assert the server 2 processed all the server 1 snapshots; it's in the db and the deployment inside were deployed
    const server1snapshots = await server1.components.database.queryWithValues<{ hash: string }>(
      SQL`SELECT DISTINCT hash from snapshots ORDER BY hash;`
    )
    const server2processedSnapshots = await server2.components.database.queryWithValues<{ hash: string }>(
      SQL`SELECT DISTINCT hash from processed_snapshots ORDER BY hash;`
    )
    expect(server1snapshots.rows).toEqual(server2processedSnapshots.rows)

    // assert that the fail deployments was persisted
    const failedDeployments = await server2.components.failedDeployments.getAllFailedDeployments()
    expect(failedDeployments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: deployment.entityId
        })
      ])
    )

    // assert that the entity was not deployed on server 2
    const { deployments } = await getDeployments(server2.components, server2.components.database)
    expect(deployments).toHaveLength(0)
  })

  function advanceTime(msToAdvance: number) {
    baseTimestamp += msToAdvance
  }

  async function deployEntityAtTimestamp(server: TestProgram, pointer: string, timestamp: number): Promise<Deployment> {
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData([pointer], {
      metadata: { a: 'metadata' },
      timestamp
    })
    return buildDeployment(deployData, entityBeingDeployed, await server.deployEntity(deployData))
  }
})
