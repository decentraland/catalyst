import { Environment, SERVER_PORT } from "../../src/Environment"
import { Server } from "../../src/Server"
import fetch from "node-fetch"
import { EntityType, Entity } from "../../src/service/Entity"
import { Hashing } from "../../src/service/Hashing"
import { buildEntityAndFile } from "../service/EntityTestFactory"
import fs from "fs"
import FormData from "form-data"
import { DeploymentEvent, HistoryType } from "../../src/service/history/HistoryManager"

describe("End 2 end deploy test", function() {
    let env: Environment
    let server: Server

    beforeAll(() => {
        env = Environment.getInstance()
        server = new Server(env)
        server.start()
    })
    afterAll(() => server.stop())

    it(`Deploy and retrieve some content`, async () => {

        //------------------------------
        // Deploy the content
        //------------------------------
        const [deployData, entityBeingDeployed] = await createDeployData()

        const form = new FormData();
        form.append('entityId'  , deployData.entityId)
        form.append('ethAddress', deployData.ethAddress)
        form.append('signature' , deployData.signature)
        deployData.files.forEach(f => {
            form.append(f[0], f[1], {
                filename: f[0],
            });
        })

        const deployResponse = await fetch(`http://localhost:${env.getConfig(SERVER_PORT)}/entities`, { method: 'POST', body: form })

        expect(deployResponse.ok).toBe(true)

        const json = await deployResponse.json()
        console.log(json);

        //------------------------------
        // Retrieve the entity by id
        //------------------------------
        const responseById = await fetch(`http://localhost:${env.getConfig(SERVER_PORT)}/entities/scenes?id=${deployData.entityId}`)
        expect(responseById.ok).toBe(true)
        const scenesById: Entity[] = await responseById.json();
        validateReceivedData(scenesById, deployData)

        //------------------------------
        // Retrieve the entity by pointer
        //------------------------------
        const responseByPointer = await fetch(`http://localhost:${env.getConfig(SERVER_PORT)}/entities/scenes?pointer=0,0`)
        expect(responseByPointer.ok).toBe(true)
        const scenesByPointer: Entity[] = await responseByPointer.json();
        validateReceivedData(scenesByPointer, deployData)

        const responseHistory = await fetch(`http://localhost:${env.getConfig(SERVER_PORT)}/history`)
        expect(responseHistory.ok).toBe(true)
        const [deploymentEvent]: DeploymentEvent[] = await responseHistory.json()
        validateHistoryEvent(deploymentEvent, deployData, entityBeingDeployed)
    });


})

async function createDeployData(): Promise<[DeployData, Entity]> {
    const fileContent1: Buffer = fs.readFileSync('content/test/end2end/some-binary-file.png');
    const fileContent2: Buffer = fs.readFileSync('content/test/end2end/some-text-file.txt');

    const fileHash1: string = await Hashing.calculateBufferHash(fileContent1)
    const fileHash2: string = await Hashing.calculateBufferHash(fileContent2)

    const content = new Map<string, string>()
    content.set("the-file-1", fileHash1)
    content.set("the-file-2", fileHash2)

    const [entity, entityFile] = await buildEntityAndFile(
        'entity.json',
        EntityType.SCENE,
        ["0,0", "0,1"],
        Date.now(),
        content,
        "this is just some metadata")
    const deployData: DeployData = {
        entityId: entity.id,
        ethAddress: "some-eth-address",
        signature: "some-signature",
        files: [
            [entityFile.name, entityFile.content],
            [fileHash1, fileContent1],
            [fileHash2, fileContent2],
        ]
    }
    return [deployData, entity]
}

function validateHistoryEvent(deploymentEvent: DeploymentEvent, deployData: DeployData, entityBeingDeployed: Entity) {
    expect(deploymentEvent.type).toBe(HistoryType.DEPLOYMENT)
    expect(deploymentEvent.entityId).toBe(deployData.entityId)
    expect(deploymentEvent.entityType).toBe(entityBeingDeployed.type)
    expect(deploymentEvent.timestamp).toBe(entityBeingDeployed.timestamp)
}

function validateReceivedData(receivedScenes: Entity[], deployData: DeployData) {
    expect(receivedScenes.length).toBe(1)
    expect(receivedScenes[0].id).toBe(deployData.entityId)
    expect(receivedScenes[0].metadata).toBe("this is just some metadata")
    // TODO: validate the rest of the data
    console.log(receivedScenes)
}

type DeployData = {
    entityId: string,
    ethAddress: string,
    signature: string,
    files: [string, Buffer][]
}