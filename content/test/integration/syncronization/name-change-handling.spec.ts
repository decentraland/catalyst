import ms from "ms"
import fs from "fs"
import { Timestamp } from "@katalyst/content/service/time/TimeSorting"
import { DAOClient } from "decentraland-katalyst-commons/DAOClient"
import { Environment, EnvironmentConfig } from "@katalyst/content/Environment"
import { TestServer } from "../TestServer"
import { buildDeployData, buildBaseEnv, deleteServerStorage, buildDeployDataAfterEntity, stopServers, awaitUntil } from "../E2ETestUtils"
import { assertHistoryOnServerHasEvents, buildEvent } from "../E2EAssertions"
import { MockedDAOClient } from "@katalyst/test-helpers/service/synchronization/clients/MockedDAOClient"
import { ControllerEntity } from "@katalyst/content/controller/Controller"
import { DeploymentEvent } from "@katalyst/content/service/history/HistoryManager"
import { EntityType } from "@katalyst/content/service/Entity"


describe("End 2 end - Name change handling", function() {

    const SYNC_INTERVAL: number = ms("1s")
    const DAO_SYNC_INTERVAL: number = ms("8s")
    let server1: TestServer, server2: TestServer
    let dao


    beforeEach(async () => {
        dao = MockedDAOClient.withAddresses('http://localhost:6060', 'http://localhost:7070')
        server1 = await buildServer("Server1_", 6060, SYNC_INTERVAL, dao)
        server2 = await buildServer("Server2_", 7070, SYNC_INTERVAL, dao)
    })

    afterEach(async () => {
        await stopServers(server1, server2)
        deleteServerStorage(server1, server2)
    })

    it('When a node\'s name changes, other nodes can handle it and continue to sync', async () => {
        // Start server 1 and 2
        await Promise.all([server1.start(), server2.start()])

        // Prepare data to be deployed
        const [deployData1, entity1] = await buildDeployData(["X1,Y1", "X2,Y2"], "metadata")

        // Deploy entity1 on server 1
        const deploymentTimestamp1: Timestamp = await server1.deploy(deployData1)
        const deploymentEvent1 = buildEvent(entity1, server1, deploymentTimestamp1)

        // Assert servers 1 and 2 are synced
        await awaitUntil(() => assertHistoryOnServerHasEvents(server2, deploymentEvent1))

        // Change name and do hard restart
        const newName = "newName"
        await changeNameInStorage(server1, newName)
        await server1.stop()
        server1 = await buildServer("Server1_", 6060, SYNC_INTERVAL, dao)
        await server1.start()

        // Prepare data to be deployed
        const [deployData2, entity2] = await buildDeployDataAfterEntity(["X2,Y2"], "metadata2", entity1)

        // Deploy entity2 on server 1
        const deploymentTimestamp2: Timestamp = await server1.deploy(deployData2)
        const deploymentEvent2 = buildEventWithName(entity2, newName, deploymentTimestamp2)

        // Assert servers 1 and 2 are synced, since they sync with DAO to happen
        await awaitUntil(() => assertHistoryOnServerHasEvents(server2, deploymentEvent1, deploymentEvent2))
    })

    function changeNameInStorage(server: TestServer, newName: string) {
        const nameFile = server.storageFolder + '/naming/name.txt'
        return fs.promises.writeFile(nameFile, Buffer.from(newName))
    }

    async function buildServer(namePrefix: string, port: number, syncInterval: number, daoClient: DAOClient) {
        const env: Environment = await buildBaseEnv(namePrefix, port, syncInterval, daoClient)
            .withConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL, DAO_SYNC_INTERVAL)
            .withConfig(EnvironmentConfig.REQUEST_TTL_BACKWARDS, ms('5s'))
            .build()
        return new TestServer(env)
    }

    function buildEventWithName(entity: ControllerEntity, serverName: string, timestamp: Timestamp): DeploymentEvent {
        return {
            serverName: serverName,
            entityId: entity.id,
            entityType: EntityType[entity.type.toUpperCase().trim()],
            timestamp,
        }
    }

})
