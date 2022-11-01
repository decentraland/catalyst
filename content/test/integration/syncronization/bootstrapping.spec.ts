import future from 'fp-future'
import ms from 'ms'
import SQL from 'sql-template-strings'
import { getProcessedSnapshots } from '../../../src/logic/database-queries/snapshots-queries'
import * as timeRangeLogic from '../../../src/logic/time-range'
import { Deployment } from '../../../src/service/deployments/types'
import { bootstrapFromSnapshots } from '../../../src/service/synchronization/bootstrapFromSnapshots'
import { assertDeploymentsAreReported, buildDeployment } from '../E2EAssertions'
import { loadTestEnvironment } from '../E2ETestEnvironment'
import { buildDeployData } from '../E2ETestUtils'
import { TestProgram } from '../TestProgram'

loadTestEnvironment()('Bootstrapping synchronization tests', function (testEnv) {
  const SYNC_INTERVAL: number = ms('1s')
  let server1: TestProgram, server2: TestProgram
  const initialTimestamp = 1577836800000

  let fakeNow: () => number
  let baseTimestamp = 0

  beforeEach(async () => {
    ;[server1, server2] = await testEnv.configServer(SYNC_INTERVAL).andBuildMany(2)
    jest.restoreAllMocks()

    const now = Date.now()
    baseTimestamp = 0
    fakeNow = () => Date.now() - now + initialTimestamp + baseTimestamp
    jest.spyOn(server1.components.clock, 'now').mockImplementation(fakeNow)
    jest.spyOn(server2.components.clock, 'now').mockImplementation(fakeNow)
    jest.spyOn(server1.components.validator, 'validate').mockResolvedValue({ ok: true })
    jest.spyOn(server2.components.validator, 'validate').mockResolvedValue({ ok: true })
  })

  it('when a server bootstraps, it should processed the snapshots of other servers', async () => {
    // it should create 7 daily empty snapshots starting at initialTimestamp
    advanceTime(timeRangeLogic.MS_PER_WEEK)
    await server1.startProgram()

    const bootstrapFromSnapshotsFinished = bootstrapFromSnapshotsFinishedFuture(server2)
    await server2.startProgram()
    await bootstrapFromSnapshotsFinished

    // once the bootstrap from snapshots finished, it should have processed the server1 snapshots.
    const server1Snapshots =
      new Set((await server1.components.database.queryWithValues<{ hash: string }>(SQL`SELECT DISTINCT hash from snapshots;`)).rows.map(s => s.hash))

    const server2ProcessedSnapshots = await getProcessedSnapshots(server2.components, Array.from(server1Snapshots))
    expect(server1Snapshots.size > 0).toBeTruthy()
    expect(server2ProcessedSnapshots).toEqual(server1Snapshots)
  })

  it('when a server process a snapshot, it deploys the entities insdide it', async () => {
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
    if (server1.components.snapshotGenerator.start) await server1.components.snapshotGenerator.start({ started: jest.fn(), live: jest.fn(), getComponents: jest.fn() })

    // now we start a new server 2 and expect that after bootstrap, it processed all the snapshots from server 1
    const bootstrapFromSnapshotsFinished = bootstrapFromSnapshotsFinishedFuture(server2)
    await server2.startProgram()
    await bootstrapFromSnapshotsFinished

    // now we assert the server 2 processed all the server 1 snapshots; it's in the db and the deployment inside were deployed
    const server1snapshots = await server1.components.database
      .queryWithValues<{ hash: string }>(SQL`SELECT DISTINCT hash from snapshots ORDER BY hash;`)
    const server2processedSnapshots = await server2.components.database
      .queryWithValues<{ hash: string }>(SQL`SELECT DISTINCT hash from processed_snapshots ORDER BY hash;`)
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
    if (server1.components.snapshotGenerator.start) await server1.components.snapshotGenerator.start({ started: jest.fn(), live: jest.fn(), getComponents: jest.fn() })

    // now we start a new server 2 so it processes the 3 snapshots: the first one, the second one and the 5 empty ones (only one is processed)
    // const markSnapshotProcessedSpy = jest.spyOn(server2.components.processedSnapshotStorage, 'markSnapshotProcessed')
    // const saveProcessedSpy = jest.spyOn(server2.components.processedSnapshotStorage, 'saveProcessed')
    const endStreamOfSpy = jest.spyOn(server2.components.processedSnapshots, 'endStreamOf')
    await server2.startProgram()
    expect(endStreamOfSpy).toBeCalledTimes(3)

    // now we deploy a new entity for the 8th day
    advanceTime(timeRangeLogic.MS_PER_DAY)
    const deployment3 = await deployEntityAtTimestamp(server1, 'p3', fakeNow() + 1)
    await assertDeploymentsAreReported(server1, deployment1, deployment2, deployment3)

    // now we advance the clock one day more, 8 days passed, it will generate 1 weekly snapshot (replacing the first 7)
    // and a new daily one for the 8th day
    if (server1.components.snapshotGenerator.stop) await server1.components.snapshotGenerator.stop()
    advanceTime(timeRangeLogic.MS_PER_DAY)
    if (server1.components.snapshotGenerator.start) await server1.components.snapshotGenerator.start({ started: jest.fn(), live: jest.fn(), getComponents: jest.fn() })

    // now we run the bootstrap from snapshots again in server 2 (would be nice a mechanism to restart the server)
    // it should save the weekly snapshot as already processed as it already processed the 7 ones that it's replacing
    // it should process only the last daily snapshot
    endStreamOfSpy.mockReset()
    await bootstrapFromSnapshots(server2.components)
    expect(endStreamOfSpy).toBeCalledTimes(1)

  })

  it('when a server bootstraps, it should persist failed deployments but mark as processed the snapshots', async () => {
    jest.spyOn(server2.components.validator, 'validate').mockResolvedValue({ ok: false })

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
    if (server1.components.snapshotGenerator.start) await server1.components.snapshotGenerator.start({ started: jest.fn(), live: jest.fn(), getComponents: jest.fn() })

    // now we start a new server 2 and expect that after bootstrap, it processed all the snapshots from server 1
    const bootstrapFromSnapshotsFinished = bootstrapFromSnapshotsFinishedFuture(server2)
    await server2.startProgram()
    await bootstrapFromSnapshotsFinished

    // now we assert the server 2 processed all the server 1 snapshots; it's in the db and the deployment inside were deployed
    const server1snapshots = await server1.components.database
      .queryWithValues<{ hash: string }>(SQL`SELECT DISTINCT hash from snapshots ORDER BY hash;`)
    const server2processedSnapshots = await server2.components.database
      .queryWithValues<{ hash: string }>(SQL`SELECT DISTINCT hash from processed_snapshots ORDER BY hash;`)
    expect(server1snapshots.rows).toEqual(server2processedSnapshots.rows)

    // assert that the fail deployments was persisted
    const failedDeployments = await server2.components.failedDeployments.getAllFailedDeployments()
    expect(failedDeployments).toEqual(expect.arrayContaining([expect.objectContaining({
      entityId: deployment.entityId
    })]))

    // assert that the entity was not deployed on server 2
    const { deployments } = await server2.components.deployer.getDeployments()
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
    return buildDeployment(deployData, entityBeingDeployed, await server.deploy(deployData))
  }
})

async function bootstrapFromSnapshotsFinishedFuture(server: TestProgram) {
  const bootstrapFromSnapshotsFinished = future<void>()
  const originalSync = server.components.synchronizationManager.syncWithServers
  jest.spyOn(server.components.synchronizationManager, 'syncWithServers').mockImplementation(async () => {
    bootstrapFromSnapshotsFinished.resolve()
    originalSync()
  })
  return bootstrapFromSnapshotsFinished
}
