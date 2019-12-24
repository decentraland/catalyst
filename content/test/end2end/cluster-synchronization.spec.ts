import fetch from "node-fetch"
import fs from "fs"
import path from "path"
import { random } from "faker"
import FormData from "form-data"
import * as EthCrypto from "eth-crypto"
import { EntityType, Pointer, EntityId } from "../../src/service/Entity"
import { Hashing, FileHash } from "../../src/service/Hashing"
import { ControllerEntity } from "../../src/controller/Controller"
import { DeploymentEvent, DeploymentHistory } from "../../src/service/history/HistoryManager"
import { buildControllerEntityAndFile } from "../controller/ControllerEntityTestFactory"
import { Timestamp, File, ENTITY_FILE_NAME } from "../../src/service/Service"
import { DAOClient } from "../../src/service/synchronization/clients/DAOClient"
import { Validation } from "../../src/service/Validation"
import { TestServer } from "./TestServer"

describe("End 2 end synchronization tests", function() {

    let jasmine_default_timeout
    const SYNC_INTERVAL: number = 2 * 1000 // 2 secs
    const ENTITY_TYPE: EntityType = EntityType.SCENE
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
        server1 = await TestServer.buildServer("Server1_", 6060, SYNC_INTERVAL, client)
        server2 = await TestServer.buildServer("Server2_", 7070, SYNC_INTERVAL, client)
        server3 = await TestServer.buildServer("Server3_", 8080, SYNC_INTERVAL, client)

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

        // Prepare data to be deployed
        const [deployData, entityBeingDeployed] = await buildDeployData(["X1,Y1"], "metadata")

        // Make sure there are no deployments on server 1
        await assertHistoryOnServerHasEvents(server1, )

        // Make sure there are no deployments on server 2
        await assertHistoryOnServerHasEvents(server1, )

        // Deploy the entity to server 1
        const deploymentTimestamp: Timestamp = await deployToServer(server1, deployData)
        const deploymentEvent = deployment(entityBeingDeployed, server1, deploymentTimestamp)

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
        const deploymentTimestamp1: Timestamp = await deployToServer(server1, deployData1)
        const deploymentEvent1 = deployment(entity1, server1, deploymentTimestamp1)

        const deploymentTimestamp2: Timestamp = await deployToServer(server2, deployData2)
        const deploymentEvent2 = deployment(entity2, server2, deploymentTimestamp2)

        // Stop server 2
        await server2.stop()

        // Deploy entity 3
        const deploymentTimestamp3: Timestamp = await deployToServer(server3, deployData3)
        const deploymentEvent3 = deployment(entity3, server3, deploymentTimestamp3)

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

        await assertEntitiesAreActiveOnServer(server1, entity3)
        await assertEntitiesAreActiveOnServer(server2, entity3)
        await assertEntitiesAreActiveOnServer(server3, entity3)
        await assertEntitiesAreDeployedButNotActive(server1, entity1, entity2)
        await assertEntitiesAreDeployedButNotActive(server2, entity1, entity2)
        await assertEntitiesAreDeployedButNotActive(server3, entity1, entity2)
        await assertHistoryOnServerHasEvents(server1, deploymentEvent1, deploymentEvent2, deploymentEvent3)
        await assertHistoryOnServerHasEvents(server2, deploymentEvent1, deploymentEvent2, deploymentEvent3)
        await assertHistoryOnServerHasEvents(server3, deploymentEvent1, deploymentEvent2, deploymentEvent3)
    })

    async function assertEntitiesAreDeployedButNotActive(server: TestServer, ...entities: ControllerEntity[]) {
        for (const entity of entities) {
            expect(await getEntitiesReferencesByPointers(server, entity.pointers)).not.toContain(entity.id, `Failed on server with prefix ${server.namePrefix}, when checking for pointers ${entity.pointers}`)
            await assertEntityIsOnServer(server, entity.id)
        }
    }

    async function assertEntitiesAreActiveOnServer(server: TestServer, ...entities: ControllerEntity[]) {
        const activePointers: Pointer[] = await getActivePointersOnServer(server)
        for (const entity of entities) {
            entity.pointers.forEach(pointer => expect(activePointers).toContain(pointer, `Failed on server ${server.namePrefix}`))
            expect(await getEntitiesReferencesByPointers(server, entity.pointers)).toEqual([entity.id])
            await assertEntityIsOnServer(server, entity.id)
        }
    }

    function deployment(entity: ControllerEntity, server: TestServer, timestamp: Timestamp): DeploymentEvent {
        return {
            serverName: server.namePrefix,
            entityId: entity.id,
            entityType: EntityType[entity.type.toUpperCase().trim()],
            timestamp,
        }
    }

    /** Please set the expected events from older to newer */
    async function assertHistoryOnServerHasEvents(server: TestServer, ...expectedEvents: DeploymentEvent[]) {
        const deploymentHistory: DeploymentHistory = await makeRequest(`http://${server.getAddress()}/history`)
        expect(deploymentHistory.length).toEqual(expectedEvents.length)
        for (let i = 0; i < expectedEvents.length; i++) {
            const expectedEvent: DeploymentEvent = expectedEvents[expectedEvents.length - 1 - i]
            const actualEvent: DeploymentEvent = deploymentHistory[i]
            expect(actualEvent.entityId).toBe(expectedEvent.entityId)
            expect(actualEvent.entityType).toBe(expectedEvent.entityType)
            expect(actualEvent.timestamp).toBe(expectedEvent.timestamp)
            expect(actualEvent.serverName.startsWith(expectedEvent.serverName)).toBeTruthy()
        }
    }

    async function getActivePointersOnServer(server: TestServer): Promise<Pointer[]> {
        return await makeRequest(`http://${server.getAddress()}/pointers/${ENTITY_TYPE}`)
    }

    async function getEntitiesReferencesByPointers(server: TestServer, pointers: Pointer[]): Promise<EntityId[]> {
        const filterParam = pointers.map(pointer => `pointer=${pointer}`).join("&")
        const entitiesByPointer: ControllerEntity[] = await makeRequest(`http://${server.getAddress()}/entities/${ENTITY_TYPE}?${filterParam}`)
        return [...new Set(entitiesByPointer.map(({ id }) => id)).values()]
    }

    async function assertEntityIsOnServer(server: TestServer, entityId: EntityId) {
        const entitiesById: ControllerEntity[] = await makeRequest(`http://${server.getAddress()}/entities/${ENTITY_TYPE}?id=${entityId}`)
        console.log(`Server ${server.namePrefix}, entity ${entityId}, result ${entitiesById}`)
        expect(entitiesById.length).toEqual(1, `Entity ${entityId} is not on server ${server.namePrefix}`)
        expect(entitiesById[0].id).toEqual(entityId, `Entity ${entityId} is not on server ${server.namePrefix}`)
        const response = await fetch(`http://${server.getAddress()}/contents/${entityId}`)
        expect(response.ok).toBe(true)
        const downloadedContentHash = await Hashing.calculateBufferHash(await response.buffer())
        expect(downloadedContentHash).toEqual(entityId)
    }

    async function sleep(ms: number): Promise<void> {
        return new Promise(resolve =>setTimeout(resolve, ms))
    }

    async function makeRequest (url: string): Promise<any> {
        const response = await fetch(url)
        expect(response.ok).toBe(true)
        return response.json();
    }

})

async function deployToServer(server: TestServer, deployData: DeployData): Promise<Timestamp> {
    const form = new FormData();
    form.append('entityId'  , deployData.entityId)
    form.append('ethAddress', deployData.ethAddress)
    form.append('signature' , deployData.signature)
    deployData.files.forEach((f: File) => form.append(f.name, f.content, { filename: f.name }))

    const deployResponse = await fetch(`http://${server.getAddress()}/entities`, { method: 'POST', body: form })
    expect(deployResponse.ok).toBe(true)

    const { creationTimestamp } = await deployResponse.json()
    return creationTimestamp
}

function buildDeployData(pointers: Pointer[], metadata: any, ...contentPaths: string[]): Promise<[DeployData, ControllerEntity]> {
    return buildDeployDataAfterEntity(pointers, metadata, undefined, ...contentPaths)
}

async function buildDeployDataAfterEntity(pointers: Pointer[], metadata: any, afterEntity?: ControllerEntity, ...contentPaths: string[]): Promise<[DeployData, ControllerEntity]> {
    const files: File[] = contentPaths.map(path => fs.readFileSync(path))
        .map(fileContent => ({ name: random.alphaNumeric(), content: fileContent }))

    const hashes: Map<FileHash, File> = await Hashing.calculateHashes(files)
    const content: Map<string, string> = new Map(Array.from(hashes.entries())
        .map(([hash, file]) => [file.name, hash]))

    const [entity, entityFile] = await buildControllerEntityAndFile(
        ENTITY_FILE_NAME,
        EntityType.SCENE,
        pointers,
        (afterEntity?.timestamp ?? Date.now()) + 1,
        content,
        metadata)

    const identity = EthCrypto.createIdentity();
    const messageHash = Validation.createEthereumMessageHash(entity.id)

    const deployData: DeployData = {
        entityId: entity.id,
        ethAddress: identity.address,
        signature: EthCrypto.sign(identity.privateKey, messageHash),
        files: [ entityFile, ...files]
    }

    return [deployData, entity]
}

function deleteFolderRecursive(pathToDelete: string) {
    if (fs.existsSync(pathToDelete)) {
        fs.readdirSync(pathToDelete).forEach((file, index) => {
            const curPath = path.join(pathToDelete, file);
            if (fs.lstatSync(curPath).isDirectory()) { // recurse
            deleteFolderRecursive(curPath);
            } else { // delete file
            fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(pathToDelete);
    }
  };

type DeployData = {
    entityId: string,
    ethAddress: string,
    signature: string,
    files: File[]
}