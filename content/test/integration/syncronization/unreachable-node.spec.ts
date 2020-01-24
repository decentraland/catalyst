import ms from "ms"
import { Timestamp } from "@katalyst/content/service/time/TimeSorting"
import { DAOClient } from "@katalyst/content/service/synchronization/clients/DAOClient"
import { Environment, EnvironmentConfig } from "@katalyst/content/Environment"
import { TestServer } from "../TestServer"
import { buildDeployData, sleep, buildBaseEnv, deleteServerStorage } from "../E2ETestUtils"
import { assertHistoryOnServerHasEvents, buildEvent } from "../E2EAssertions"
import { MockedDAOClient } from "./clients/MockedDAOClient"

/**
 * We will be testing how servers handle an unreachable node
 */
describe("End 2 end - Unreachable node", function() {

    let jasmine_default_timeout
    const SMALL_SYNC_INTERVAL: number = ms("1s")
    const LONG_SYNC_INTERVAL: number = ms('5s')
    let server1: TestServer, server2: TestServer, server3: TestServer
    const DAO = MockedDAOClient.with('http://localhost:6060', 'http://localhost:7070', 'http://localhost:8080')

    beforeAll(() => {
        jasmine_default_timeout = jasmine.DEFAULT_TIMEOUT_INTERVAL
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 100000
    })

    afterAll(() => {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = jasmine_default_timeout
    })

    beforeEach(async () => {
        server1 = await buildServer("Server1_", 6060, SMALL_SYNC_INTERVAL, LONG_SYNC_INTERVAL, DAO)
        server2 = await buildServer("Server2_", 7070, SMALL_SYNC_INTERVAL, LONG_SYNC_INTERVAL, DAO)
        server3 = await buildServer("Server3_", 8080, LONG_SYNC_INTERVAL, LONG_SYNC_INTERVAL, DAO)
    })

    afterEach(function() {
        server1.stop()
        server2.stop()
        server3.stop()
        deleteServerStorage(server1, server2, server3)
    })

    it('When a node is unreachable, remaining nodes ask each others for the unreachable node\'s updates', async () => {
        // Start server 1, 2 and 3
        await Promise.all([server1.start(), server2.start(), server3.start()])

        // Prepare data to be deployed
        const [deployData, entity] = await buildDeployData(["X1,Y1", "X2,Y2"], "metadata")

        // Deploy the entity on server 1
        const deploymentTimestamp: Timestamp = await server1.deploy(deployData)
        const deploymentEvent = buildEvent(entity, server1, deploymentTimestamp)

        // Wait for small sync interval
        await sleep(SMALL_SYNC_INTERVAL * 2)

        // Stop server 1
        await server1.stop()

        // Assert server 2 got the update, but server 3 didn't
        await assertHistoryOnServerHasEvents(server2, deploymentEvent)
        await assertHistoryOnServerHasEvents(server3, )

        // Wait for long sync interval
        await sleep(LONG_SYNC_INTERVAL * 2)

        // Now, server 3 detected that server 1 is down, and asked for its updated to server 2
        await assertHistoryOnServerHasEvents(server3, deploymentEvent)
    })

    async function buildServer(namePrefix: string, port: number, syncInterval: number, daoInterval: number, daoClient: DAOClient) {
        const env: Environment = await buildBaseEnv(namePrefix, port, syncInterval, daoClient)
            .withConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL, daoInterval)
            .build()
        return new TestServer(env)
    }

})
