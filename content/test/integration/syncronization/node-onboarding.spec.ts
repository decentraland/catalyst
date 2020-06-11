import { ContentFileHash, Timestamp } from "dcl-catalyst-commons"
import { TestServer } from "../TestServer"
import { buildDeployData, buildDeployDataAfterEntity, awaitUntil } from "../E2ETestUtils"
import { assertHistoryOnServerHasEvents, buildEvent, assertFileIsOnServer, assertFileIsNotOnServer, assertEntityIsOverwrittenBy, buildEventWithName, assertDeploymentsAreReported, buildDeployment } from "../E2EAssertions"
import { loadTestEnvironment } from "../E2ETestEnvironment"
import { HistoryManagerImpl } from "@katalyst/content/service/history/HistoryManagerImpl"


describe("End 2 end - Node onboarding", function() {

    const testEnv = loadTestEnvironment()
    let server1: TestServer, server2: TestServer, server3: TestServer

    beforeEach(async () => {
        [ server1, server2, server3 ] = await testEnv.configServer('1s')
            .andBuildMany(3)
    })

    it('When a node starts, it gets all the previous history', async () => {
        // Start server 1 and 2
        await Promise.all([server1.start(), server2.start()])

        // Prepare data to be deployed
        const [deployData1, entity1] = await buildDeployData(["X1,Y1", "X2,Y2"], "metadata", 'content/test/integration/resources/some-binary-file.png')
        const entity1ContentHash: ContentFileHash  = entity1.content!![0].hash
        const [deployData2, entity2] = await buildDeployDataAfterEntity(["X2,Y2"], "metadata2", entity1)

        // Deploy entity1 on server 1
        const deploymentTimestamp1: Timestamp = await server1.deploy(deployData1)
        const deploymentEvent1 = buildEvent(entity1, server1, deploymentTimestamp1)
        const deployment1 = buildDeployment(deployData1, entity1, server1, deploymentTimestamp1)

        // Deploy entity2 on server 2
        const deploymentTimestamp2: Timestamp = await server2.deploy(deployData2)
        const deploymentEvent2 = buildEvent(entity2, server2, deploymentTimestamp2)
        const deployment2 = buildDeployment(deployData2, entity2, server2, deploymentTimestamp2)

        // Wait for servers to sync and assert servers 1 and 2 are synced
        await awaitUntil(() => assertHistoryOnServerHasEvents(server1, deploymentEvent1, deploymentEvent2))
        await awaitUntil(() => assertHistoryOnServerHasEvents(server2, deploymentEvent1, deploymentEvent2))
        await awaitUntil(() => assertDeploymentsAreReported(server1, deployment1, deployment2))
        await awaitUntil(() => assertDeploymentsAreReported(server2, deployment1, deployment2))
        await assertFileIsOnServer(server1, entity1ContentHash)
        await assertEntityIsOverwrittenBy(server1, entity1, entity2)
        await assertEntityIsOverwrittenBy(server2, entity1, entity2)

        // Start server 3
        await server3.start()

        // Assert server 3 has all the history
        await awaitUntil(() => assertHistoryOnServerHasEvents(server3, deploymentEvent1, deploymentEvent2))
        await awaitUntil(() => assertDeploymentsAreReported(server3, deployment1, deployment2))

        // Make sure that is didn't download overwritten content
        await assertFileIsNotOnServer(server3, entity1ContentHash)
    })

    it('When a node starts, it even gets history for nodes that are no longer on the DAO', async () => {
        // Start server 1 and 2
        await Promise.all([server1.start(), server2.start()])

        // Prepare data to be deployed
        const [deployData, entity] = await buildDeployData(["X1,Y1", "X2,Y2"], "metadata", 'content/test/integration/resources/some-binary-file.png')
        const entityContentHash: ContentFileHash  = entity.content!![0].hash

        // Deploy entity on server 1
        const deploymentTimestamp: Timestamp = await server1.deploy(deployData)
        const deploymentEvent = buildEvent(entity, server1, deploymentTimestamp)
        const deployment = buildDeployment(deployData, entity, server1, deploymentTimestamp)

        // Wait for sync and assert servers 1 and 2 are synced
        await assertHistoryOnServerHasEvents(server1, deploymentEvent)
        await awaitUntil(() => assertHistoryOnServerHasEvents(server2, deploymentEvent))
        await assertDeploymentsAreReported(server1, deployment)
        await awaitUntil(() => assertDeploymentsAreReported(server2, deployment))
        await assertFileIsOnServer(server1, entityContentHash)
        await assertFileIsOnServer(server2, entityContentHash)

        // Remove server 1 from the dAO
        testEnv.removeFromDAO(server1.getAddress())

        // Start server 3
        await server3.start()

        // Assert server 3 has all the history, but since the server is not available anymore, the name and origin server url are unknown
        const deploymentEventWithoutName = buildEventWithName(entity, HistoryManagerImpl.UNKNOWN_NAME, deploymentTimestamp)
        deployment.auditInfo.originServerUrl = 'https://peer.decentraland.org/content'
        await awaitUntil(() => assertHistoryOnServerHasEvents(server3, deploymentEventWithoutName))
        await awaitUntil(() => assertDeploymentsAreReported(server3, deployment))

        // Make sure that even the content is properly propagated
        await assertFileIsOnServer(server1, entityContentHash)
    })

})
