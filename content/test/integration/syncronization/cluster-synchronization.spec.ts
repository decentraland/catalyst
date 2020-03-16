import ms from "ms"
import { Timestamp } from "@katalyst/content/service/time/TimeSorting"
import { DAOClient } from "decentraland-katalyst-commons/DAOClient"
import { Environment } from "@katalyst/content/Environment"
import { TestServer } from "../TestServer"
import { buildDeployData, deleteServerStorage, buildDeployDataAfterEntity, buildBaseEnv, stopServers, awaitUntil } from "../E2ETestUtils"
import { assertEntitiesAreActiveOnServer, assertEntitiesAreDeployedButNotActive, assertHistoryOnServerHasEvents, assertEntityIsOverwrittenBy, assertEntityIsNotOverwritten, buildEvent } from "../E2EAssertions"
import { MockedDAOClient } from "@katalyst/test-helpers/service/synchronization/clients/MockedDAOClient"
import { delay } from "decentraland-katalyst-utils/util"

describe("End 2 end synchronization tests", function() {

    const DAO = MockedDAOClient.withAddresses('http://localhost:6060', 'http://localhost:7070', 'http://localhost:8080')
    const SYNC_INTERVAL: number = ms("1s")
    let server1: TestServer, server2: TestServer, server3: TestServer

    beforeEach(async () => {
        server1 = await buildServer("Server1_", 6060, SYNC_INTERVAL, DAO)
        server2 = await buildServer("Server2_", 7070, SYNC_INTERVAL, DAO)
        server3 = await buildServer("Server3_", 8080, SYNC_INTERVAL, DAO)
    })

    afterEach(async function() {
        await stopServers(server1, server2, server3)
        deleteServerStorage(server1, server2, server3)
    })

    it(`When a server gets some content uploaded, then the other servers download it`, async () => {
        // Start server 1 and 2
        await Promise.all([server1.start(), server2.start()])

        // Prepare data to be deployed
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

        // Assert that the entity was synced from server 1 to server 2
        await awaitUntil(() => assertEntitiesAreActiveOnServer(server2, entityBeingDeployed))
        await assertHistoryOnServerHasEvents(server2, deploymentEvent)
    })

    it(`Even when there are no deployments, immutable time advances across all servers`, async () => {
        // Start server 1, 2 and 3
        await Promise.all([server1.start(), server2.start(), server3.start()])

        // Store their immutable time
        const immutableTimeServer1 = await getImmutableTime(server1)
        const immutableTimeServer2 = await getImmutableTime(server2)
        const immutableTimeServer3 = await getImmutableTime(server3)

        // Wait for servers to sync
        await delay(SYNC_INTERVAL * 2)

        // Get new immutable time
        const newImmutableTimeServer1 = await getImmutableTime(server1)
        const newImmutableTimeServer2 = await getImmutableTime(server2)
        const newImmutableTimeServer3 = await getImmutableTime(server3)

        // Assert immutable times advanced
        expect(newImmutableTimeServer1).toBeGreaterThan(immutableTimeServer1)
        expect(newImmutableTimeServer2).toBeGreaterThan(immutableTimeServer2)
        expect(newImmutableTimeServer3).toBeGreaterThan(immutableTimeServer3)
    })

    it(`When a server registered on the DAO never was reachable, then immutable time can't advance`, async () => {
        // Start server 1 and 2
        await Promise.all([server1.start(), server2.start()])

        // Assert immutable time is still 0
        expect(await getImmutableTime(server1)).toBe(0)
        expect(await getImmutableTime(server2)).toBe(0)

        // Wait for servers to sync
        await delay(SYNC_INTERVAL * 2)

        // Assert immutable time is still 0
        expect(await getImmutableTime(server1)).toBe(0)
        expect(await getImmutableTime(server2)).toBe(0)
    })

    it(`When a server registered on the DAO stops responding, then immutable time can't advance`, async () => {
        // Start server 1, 2 and 3
        await Promise.all([server1.start(), server2.start(), server3.start()])

        // Wait for servers to sync
        await delay(SYNC_INTERVAL * 2)

        // Assert immutable time advanced
        expect(await getImmutableTime(server1)).not.toBe(0)
        expect(await getImmutableTime(server2)).not.toBe(0)
        expect(await getImmutableTime(server3)).not.toBe(0)

        // Stop server 3
        await server3.stop()

        // Wait for servers to sync
        await delay(SYNC_INTERVAL * 5)

        // Store their immutable time
        const immutableTimeServer1 = await getImmutableTime(server1)
        const immutableTimeServer2 = await getImmutableTime(server2)

        // Wait for servers to sync
        await delay(SYNC_INTERVAL * 2)

        // Get new immutable time
        const newImmutableTimeServer1 = await getImmutableTime(server1)
        const newImmutableTimeServer2 = await getImmutableTime(server2)

       // Assert immutable time didn't advanced
       expect(newImmutableTimeServer1).toBe(immutableTimeServer1)
       expect(newImmutableTimeServer2).toBe(immutableTimeServer2)
    })

    it(`When a server finds a new deployment with already known content, it can still deploy it successfully`, async () => {
        // Start server 1 and 2
        await Promise.all([server1.start(), server2.start()])

        // Prepare data to be deployed
        const [deployData1, entityBeingDeployed1] = await buildDeployData(["X1,Y1"], "metadata", 'content/test/integration/resources/some-binary-file.png')
        const [deployData2, entityBeingDeployed2] = await buildDeployDataAfterEntity(["X2,Y2"], "metadata", entityBeingDeployed1, 'content/test/integration/resources/some-binary-file.png')

        // Deploy entity 1 on server 1
        const deploymentTimestamp1 = await server1.deploy(deployData1)
        const deploymentEvent1 = buildEvent(entityBeingDeployed1, server1, deploymentTimestamp1)

        // Wait for servers to sync
        await awaitUntil(() => assertHistoryOnServerHasEvents(server2, deploymentEvent1))

        // Deploy entity 2 on server 2
        const deploymentTimestamp2 = await server2.deploy(deployData2)
        const deploymentEvent2 = buildEvent(entityBeingDeployed2, server2, deploymentTimestamp2)

        // Assert that the entities were deployed on the servers
        await awaitUntil(() => assertHistoryOnServerHasEvents(server1, deploymentEvent1, deploymentEvent2))
        await assertHistoryOnServerHasEvents(server2, deploymentEvent1, deploymentEvent2)
    })

     /**
     * This test verifies a very corner case where:
     * A. An entity E1 is deployed first, with some pointers P1, P2
     * B. A new entity E2 is deployed on a server S, with pointers P2, P3. But the server where it was deployed,
     *    quickly goes down, before the others can see the update
     * C. A new entity E3 is deployed on one of the servers that is up, with pointers P3, P4.
     *
     * Now, until S comes up again, all other servers in the cluster should see E1 and E3. But when S starts, then
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
        await awaitUntil(() => assertHistoryOnServerHasEvents(server1, deploymentEvent1, deploymentEvent3))
        await awaitUntil(() => assertHistoryOnServerHasEvents(server3, deploymentEvent1, deploymentEvent3))

        // Make sure that both server 1 and 3 have entity 1 and 3 currently active
        await assertEntitiesAreActiveOnServer(server1, entity1, entity3)
        await assertEntitiesAreActiveOnServer(server3, entity1, entity3)

        // Restart server 2
        await server2.start()

        // Wait for servers to sync
        await awaitUntil(() => assertHistoryOnServerHasEvents(server1, deploymentEvent1, deploymentEvent2, deploymentEvent3))
        await awaitUntil(() => assertHistoryOnServerHasEvents(server2, deploymentEvent1, deploymentEvent2, deploymentEvent3))
        await awaitUntil(() => assertHistoryOnServerHasEvents(server3, deploymentEvent1, deploymentEvent2, deploymentEvent3))

        // Make assertions on Server 1
        await assertEntitiesAreActiveOnServer(server1, entity3)
        await assertEntitiesAreDeployedButNotActive(server1, entity1, entity2)
        await assertEntityIsOverwrittenBy(server1, entity1, entity2)
        await assertEntityIsOverwrittenBy(server1, entity2, entity3)
        await assertEntityIsNotOverwritten(server1, entity3)

        // Make assertions on Server 2
        await assertEntitiesAreActiveOnServer(server2, entity3)
        await assertEntitiesAreDeployedButNotActive(server2, entity1, entity2)
        await assertEntityIsOverwrittenBy(server2, entity1, entity2)
        await assertEntityIsOverwrittenBy(server2, entity2, entity3)
        await assertEntityIsNotOverwritten(server2, entity3)

        // Make assertions on Server 3
        await assertEntitiesAreActiveOnServer(server3, entity3)
        await assertEntitiesAreDeployedButNotActive(server3, entity1, entity2)
        await assertEntityIsOverwrittenBy(server3, entity1, entity2)
        await assertEntityIsOverwrittenBy(server3, entity2, entity3)
        await assertEntityIsNotOverwritten(server3, entity3)
    })

    function getImmutableTime(server: TestServer): Promise<Timestamp> {
        return server.getStatus().then(({ lastImmutableTime }) => lastImmutableTime)
    }

    async function buildServer(namePrefix: string, port: number, syncInterval: number, daoClient: DAOClient) {
        const env: Environment = await buildBaseEnv(namePrefix, port, syncInterval, daoClient).build()
        return new TestServer(env)
    }

})
