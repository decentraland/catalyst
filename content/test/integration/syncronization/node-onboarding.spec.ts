import ms from "ms"
import { Timestamp } from "@katalyst/content/service/time/TimeSorting"
import { DAOClient } from "decentraland-katalyst-commons/DAOClient"
import { ControllerEntityContent } from "@katalyst/content/controller/Controller"
import { ContentFileHash } from "@katalyst/content/service/Hashing"
import { Environment } from "@katalyst/content/Environment"
import { TestServer } from "../TestServer"
import { buildDeployData, buildBaseEnv, deleteServerStorage, buildDeployDataAfterEntity, awaitUntil } from "../E2ETestUtils"
import { assertHistoryOnServerHasEvents, buildEvent, assertFileIsOnServer, assertFileIsNotOnServer, assertEntityIsOverwrittenBy } from "../E2EAssertions"
import { MockedDAOClient } from "./clients/MockedDAOClient"


describe("End 2 end - Node onboarding", function() {

    const SYNC_INTERVAL: number = ms("1s")
    let server1: TestServer, server2: TestServer, server3: TestServer
    let dao

    beforeEach(async () => {
        dao = MockedDAOClient.withAddresses('http://localhost:6060', 'http://localhost:7070')
        server1 = await buildServer("Server1_", 6060, SYNC_INTERVAL, dao)
        server2 = await buildServer("Server2_", 7070, SYNC_INTERVAL, dao)
        server3 = await buildServer("Server3_", 8080, SYNC_INTERVAL, dao)
    })

    afterEach(async () => {
        await server1.stop()
        await server2.stop()
        await server3.stop()
        deleteServerStorage(server1, server2, server3)
    })

    it('When a node starts, it get all the previous history', async () => {
        // Start server 1 and 2
        await Promise.all([server1.start(), server2.start()])

        // Prepare data to be deployed
        const [deployData1, entity1] = await buildDeployData(["X1,Y1", "X2,Y2"], "metadata", 'content/test/integration/resources/some-binary-file.png')
        const entity1ContentHash: ContentFileHash  = (entity1.content as ControllerEntityContent[])[0].hash
        const [deployData2, entity2] = await buildDeployDataAfterEntity(["X2,Y2"], "metadata2", entity1)

        // Deploy entity1 on server 1
        const deploymentTimestamp1: Timestamp = await server1.deploy(deployData1)
        const deploymentEvent1 = buildEvent(entity1, server1, deploymentTimestamp1)

        // Deploy entity2 on server 2
        const deploymentTimestamp2: Timestamp = await server2.deploy(deployData2)
        const deploymentEvent2 = buildEvent(entity2, server2, deploymentTimestamp2)

        // Wait for servers to sync and assert servers 1 and 2 are synced
        await awaitUntil(() => assertHistoryOnServerHasEvents(server1, deploymentEvent1, deploymentEvent2))
        await awaitUntil(() => assertHistoryOnServerHasEvents(server2, deploymentEvent1, deploymentEvent2))
        await assertFileIsOnServer(server1, entity1ContentHash)
        await assertFileIsNotOnServer(server2, entity1ContentHash)
        await assertEntityIsOverwrittenBy(server1, entity1, entity2)
        await assertEntityIsOverwrittenBy(server2, entity1, entity2)

        // Start server 3
        await server3.start()

        // Assert server 3 has all the history
        await awaitUntil(() => assertHistoryOnServerHasEvents(server3, deploymentEvent1, deploymentEvent2))

        // Make sure that is didn't download overwritten content
        await assertFileIsNotOnServer(server1, entity1ContentHash)
    })

    it('When a node starts, it even gets history for nodes that are no longer on the DAO', async () => {
        // Start server 1 and 2
        await Promise.all([server1.start(), server2.start()])

        // Prepare data to be deployed
        const [deployData, entity] = await buildDeployData(["X1,Y1", "X2,Y2"], "metadata", 'content/test/integration/resources/some-binary-file.png')
        const entityContentHash: ContentFileHash  = (entity.content as ControllerEntityContent[])[0].hash

        // Deploy entity on server 1
        const deploymentTimestamp: Timestamp = await server1.deploy(deployData)
        const deploymentEvent = buildEvent(entity, server1, deploymentTimestamp)

        // Wait for sync and assert servers 1 and 2 are synced
        await assertHistoryOnServerHasEvents(server1, deploymentEvent)
        await awaitUntil(() => assertHistoryOnServerHasEvents(server2, deploymentEvent))
        await assertFileIsOnServer(server1, entityContentHash)
        await assertFileIsOnServer(server2, entityContentHash)

        // Remove server 1 from the dAO
        dao.remove(server1.getAddress())

        // Start server 3
        await server3.start()

        // Assert server 3 has all the history
        await awaitUntil(() => assertHistoryOnServerHasEvents(server3, deploymentEvent))

        // Make sure that even the content is properly propagated
        await assertFileIsOnServer(server1, entityContentHash)
    })


    async function buildServer(namePrefix: string, port: number, syncInterval: number, daoClient: DAOClient) {
        const env: Environment = await buildBaseEnv(namePrefix, port, syncInterval, daoClient).build()
        return new TestServer(env)
    }

})
