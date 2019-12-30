import ms from "ms"
import { Timestamp } from "../../../src/service/Service"
import { DAOClient } from "../../../src/service/synchronization/clients/DAOClient"
import { TestServer } from "../TestServer"
import { buildDeployData, deleteFolderRecursive, buildDeployDataAfterEntity, sleep } from "../TestUtils"
import { Environment, EnvironmentBuilder, EnvironmentConfig, Bean } from "../../../src/Environment"
import { MockedContentAnalytics } from "../../service/analytics/MockedContentAnalytics"
import { MockedAccessChecker } from "../../service/MockedAccessChecker"
import { assertEntitiesAreActiveOnServer, assertEntitiesAreDeployedButNotActive, assertHistoryOnServerHasEvents, assertEntityIsOverwrittenBy, assertEntityIsNotOverwritten, buildEvent } from "../E2EAssertions"

describe("End 2 end synchronization tests", function() {

    let jasmine_default_timeout
    const SYNC_INTERVAL: number = ms("2s")
    let server1: TestServer, server2: TestServer, server3: TestServer

    beforeAll(() => {
        jasmine_default_timeout = jasmine.DEFAULT_TIMEOUT_INTERVAL
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 100000
    })

    afterAll(() => {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = jasmine_default_timeout
    })

    beforeEach(async () => {
        const client: DAOClient = {
            registerServerInDAO: () => Promise.resolve(),
            getAllServers: () => Promise.resolve(['localhost:6060', 'localhost:7070', 'localhost:8080']),
        }
        server1 = await buildServer("Server1_", 6060, SYNC_INTERVAL, client)
        server2 = await buildServer("Server2_", 7070, SYNC_INTERVAL, client)
        server3 = await buildServer("Server3_", 8080, SYNC_INTERVAL, client)

    })

    afterEach(function() {
        server1.stop()
        server2.stop()
        server3.stop()
        deleteFolderRecursive(server1.storageFolder)
        deleteFolderRecursive(server2.storageFolder)
        deleteFolderRecursive(server3.storageFolder)
    })

    it(`When a server gets some content uploaded, then the other servers download it`, async () => {
        // Start server 1 and 2
        await Promise.all([server1.start(), server2.start()])

        // Prepara data to be deployed
        const [deployData, entityBeingDeployed] = await buildDeployData(["X1,Y1"], "metadata")

        // Make sure there are no deployments on server 1
        await assertHistoryOnServerHasEvents(server1, )

        // Make sure there are no deployments on server 2
        await assertHistoryOnServerHasEvents(server2, )

        // Deploy the entity to server 1
        const deploymentTimestamp: Timestamp = await server1.deploy(deployData)
        const deploymentEvent = buildEvent(entityBeingDeployed, server1, deploymentTimestamp)

        // Assert that the entity was deployed on server 1
        await assertHistoryOnServerHasEvents(server1, deploymentEvent)

        // Wait for servers to sync
        await sleep(SYNC_INTERVAL * 2)

        // Assert that the entity was synced from server 1 to server 2
        await assertEntitiesAreActiveOnServer(server2, entityBeingDeployed)
        await assertHistoryOnServerHasEvents(server2, deploymentEvent)
    })

     /**
     * This test verifies a very corner case where:
     * A. An entity E1 is deployed first, with some pointers P1, P2
     * B. A new entity E2 is deployed on a server S, with pointers P2, P3. But the server where it was deployed,
     *    quickly goes down, before the others can see the update
     * C. A new entity E3 is deployed on one of the servers that is up, with pointers P3, P4.
     *
     * Now, until S cames up again, all other servers in the cluster should see E1 and E3. But when S starts, then
     * only E3 should be present on all servers.
     *
     */
    it('When a lost update is detected, previous entities are deleted but new ones aren\'t', async () => {
        // Start server 1, 2 and 3
        await Promise.all([server1.start(), server2.start(), server3.start()])

        // Prepare data to be deployed
        const [deployData1, entity1] = await buildDeployData(["X1,Y1", "X2,Y2"], "metadata")
        const [deployData2, entity2] = await buildDeployDataAfterEntity(["X2,Y2", "X3,Y3"], "metadata2", entity1)
        const [deployData3, entity3] = await buildDeployDataAfterEntity(["X3,Y3", "X4,Y4"], "metadata3", entity2)


        // Deploy the entities 1 and 2
        const deploymentTimestamp1: Timestamp = await server1.deploy(deployData1)
        const deploymentEvent1 = buildEvent(entity1, server1, deploymentTimestamp1)

        const deploymentTimestamp2: Timestamp = await server2.deploy(deployData2)
        const deploymentEvent2 = buildEvent(entity2, server2, deploymentTimestamp2)

        // Stop server 2
        await server2.stop()

        // Deploy entity 3
        const deploymentTimestamp3: Timestamp = await server3.deploy(deployData3)
        const deploymentEvent3 = buildEvent(entity3, server3, deploymentTimestamp3)

        // Wait for servers to sync
        await sleep(SYNC_INTERVAL * 2)

        // Make sure that both server 1 and 3 have entity 1 and 3 currently active
        await assertEntitiesAreActiveOnServer(server1, entity1, entity3)
        await assertEntitiesAreActiveOnServer(server3, entity1, entity3)
        await assertHistoryOnServerHasEvents(server1, deploymentEvent1, deploymentEvent3)
        await assertHistoryOnServerHasEvents(server3, deploymentEvent1, deploymentEvent3)

        // Restart server 2
        await server2.start()

        // Wait for servers to sync
        await sleep(SYNC_INTERVAL * 2)

        // Make assertions on Server 1
        await assertEntitiesAreActiveOnServer(server1, entity3)
        await assertEntitiesAreDeployedButNotActive(server1, entity1, entity2)
        await assertHistoryOnServerHasEvents(server1, deploymentEvent1, deploymentEvent2, deploymentEvent3)
        await assertEntityIsOverwrittenBy(server1, entity1, entity2)
        await assertEntityIsOverwrittenBy(server1, entity2, entity3)
        await assertEntityIsNotOverwritten(server1, entity3)

        // Make assertions on Server 2
        await assertEntitiesAreActiveOnServer(server2, entity3)
        await assertEntitiesAreDeployedButNotActive(server2, entity1, entity2)
        await assertHistoryOnServerHasEvents(server2, deploymentEvent1, deploymentEvent2, deploymentEvent3)
        await assertEntityIsOverwrittenBy(server2, entity1, entity2)
        await assertEntityIsOverwrittenBy(server2, entity2, entity3)
        await assertEntityIsNotOverwritten(server2, entity3)

        // Make assertions on Server 3
        await assertEntitiesAreActiveOnServer(server3, entity3)
        await assertEntitiesAreDeployedButNotActive(server3, entity1, entity2)
        await assertHistoryOnServerHasEvents(server3, deploymentEvent1, deploymentEvent2, deploymentEvent3)
        await assertEntityIsOverwrittenBy(server3, entity1, entity2)
        await assertEntityIsOverwrittenBy(server3, entity2, entity3)
        await assertEntityIsNotOverwritten(server3, entity3)
    })

    async function buildServer(namePrefix: string, port: number, syncInterval: number, daoClient: DAOClient) {
        const env: Environment = await new EnvironmentBuilder()
            .withConfig(EnvironmentConfig.NAME_PREFIX, namePrefix)
            .withConfig(EnvironmentConfig.SERVER_PORT, port)
            .withConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, "storage_" + namePrefix)
            .withConfig(EnvironmentConfig.LOG_REQUESTS, false)
            .withConfig(EnvironmentConfig.SYNC_WITH_SERVERS_INTERVAL, syncInterval)
            .withBean(Bean.DAO_CLIENT, daoClient)
            .withAnalytics(new MockedContentAnalytics())
            .withAccessChecker(new MockedAccessChecker())
            .build()
        return new TestServer(env)
    }

})





