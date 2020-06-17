import ms from "ms"
import { Timestamp, delay } from "dcl-catalyst-commons"
import { EnvironmentConfig } from "@katalyst/content/Environment"
import { TestServer } from "../TestServer"
import { buildDeployData, awaitUntil } from "../E2ETestUtils"
import { assertHistoryOnServerHasEvents, buildEvent, assertDeploymentsAreReported, buildDeployment } from "../E2EAssertions"
import { loadTestEnvironment } from "../E2ETestEnvironment"

/**
 * We will be testing how servers handle an unreachable node
 */
describe("End 2 end - Unreachable node", function() {

    const SMALL_SYNC_INTERVAL: number = ms("1s")
    const LONG_SYNC_INTERVAL: number = ms('5s')
    const testEnv = loadTestEnvironment()
    let server1 : TestServer, server2: TestServer, server3: TestServer

    beforeEach(async () => {
        const config = testEnv.configServer()
            .withConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL, LONG_SYNC_INTERVAL);

        [ server1, server2 ] = await config
            .withConfig(EnvironmentConfig.SYNC_WITH_SERVERS_INTERVAL, SMALL_SYNC_INTERVAL)
            .andBuildOnPorts([ 6060, 7070 ]);

        [ server3 ] = await config
            .withConfig(EnvironmentConfig.SYNC_WITH_SERVERS_INTERVAL, LONG_SYNC_INTERVAL)
            .andBuildOnPorts([ 8080 ])
    })

    it('When a node is unreachable, remaining nodes ask each others for the unreachable node\'s updates', async () => {
        // Start server 1, 2 and 3
        await Promise.all([server1.start(), server2.start(), server3.start()])

        // Wait a little bit so server 3 does the initial sync
        await delay('1s')

        // Prepare data to be deployed
        const { deployData, controllerEntity: entity } = await buildDeployData(["X1,Y1", "X2,Y2"], { metadata: 'metadata' })

        // Deploy the entity on server 1
        const deploymentTimestamp: Timestamp = await server1.deploy(deployData)
        const deploymentEvent = buildEvent(entity, server1, deploymentTimestamp)
        const deployment = buildDeployment(deployData, entity, server1, deploymentTimestamp)

        // Wait until server 2 got the update
        await awaitUntil(() => assertHistoryOnServerHasEvents(server2, deploymentEvent))
        await awaitUntil(() => assertDeploymentsAreReported(server2, deployment))

        // Stop server 1
        await server1.stop()

        // Assert server 3 didn't get the update
        await assertHistoryOnServerHasEvents(server3, )
        await assertDeploymentsAreReported(server3, )

        // Now, server 3 detected that server 1 is down, and asked for its updated to server 2
        await awaitUntil(() => assertHistoryOnServerHasEvents(server3, deploymentEvent), 10, '3s')
        await awaitUntil(() => assertDeploymentsAreReported(server3, deployment), 10, '3s')
    })

})
