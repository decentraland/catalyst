import { Environment, SERVER_PORT, STORAGE_ROOT_FOLDER } from "../../src/Environment"
import { Server } from "../../src/Server"
import { ControllerEntity } from "../../src/controller/Controller"
import fetch from "node-fetch"
import { EntityType } from "../../src/service/Entity"
import { Hashing } from "../../src/service/Hashing"
import fs from "fs"
import path from "path"
import FormData from "form-data"
import { DeploymentEvent, DeploymentHistory } from "../../src/service/history/HistoryManager"
import { buildControllerEntityAndFile } from "../controller/ControllerEntityTestFactory"
import { Timestamp } from "../../src/service/Service"

describe("End 2 end deploy test", function() {

    beforeAll(async function() {
        this.env = await Environment.getInstance()
        this.server = new Server(this.env)
        this.server.start()
    })

    afterAll(function() {
        this.server.stop()
        deleteFolderRecursive(this.env.getConfig(STORAGE_ROOT_FOLDER))
    })


    it(`Deploy and retrieve some content`, async function() {
        //------------------------------
        // Deploy the content
        //------------------------------
        const [deployData, entityBeingDeployed] = await createDeployData()

        const form = new FormData();
        form.append('entityId'  , deployData.entityId)
        form.append('ethAddress', deployData.ethAddress)
        form.append('signature' , deployData.signature)
        deployData.files.forEach(f => {
            form.append(f.file, f.content, {
                filename: f.file,
            });
        })

        const deployResponse = await fetch(`http://localhost:${this.env.getConfig(SERVER_PORT)}/entities`, { method: 'POST', body: form })

        expect(deployResponse.ok).toBe(true)

        const { creationTimestamp } = await deployResponse.json()
        const deltaTimestamp = Date.now() - creationTimestamp
        expect(deltaTimestamp).toBeLessThanOrEqual(50)
        expect(deltaTimestamp).toBeGreaterThanOrEqual(0)

        //------------------------------
        // Retrieve the entity by id
        //------------------------------
        const responseById = await fetch(`http://localhost:${this.env.getConfig(SERVER_PORT)}/entities/scenes?id=${deployData.entityId}`)
        expect(responseById.ok).toBe(true)
        const scenesById: ControllerEntity[] = await responseById.json();
        await validateReceivedData(scenesById, deployData, this.env)

        //------------------------------
        // Retrieve the entity by pointer
        //------------------------------
        const responseByPointer = await fetch(`http://localhost:${this.env.getConfig(SERVER_PORT)}/entities/scenes?pointer=0,0`)
        expect(responseByPointer.ok).toBe(true)
        const scenesByPointer: ControllerEntity[] = await responseByPointer.json();
        await validateReceivedData(scenesByPointer, deployData, this.env)

        const responseHistory = await fetch(`http://localhost:${this.env.getConfig(SERVER_PORT)}/history`)
        expect(responseHistory.ok).toBe(true)
        const [deploymentEvent]: DeploymentHistory = await responseHistory.json()
        validateHistoryEvent(deploymentEvent, deployData, entityBeingDeployed, creationTimestamp)
    });


})

async function createDeployData(): Promise<[DeployData, ControllerEntity]> {
    const fileContent1: Buffer = fs.readFileSync('content/test/end2end/some-binary-file.png');
    const fileContent2: Buffer = fs.readFileSync('content/test/end2end/some-text-file.txt');

    const fileHash1: string = await Hashing.calculateBufferHash(fileContent1)
    const fileHash2: string = await Hashing.calculateBufferHash(fileContent2)

    const content = new Map<string, string>()
    content.set("the-file-1", fileHash1)
    content.set("the-file-2", fileHash2)

    const [entity, entityFile] = await buildControllerEntityAndFile(
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
            {file: entityFile.name, content: entityFile.content},
            {file: fileHash1, content: fileContent1},
            {file: fileHash2, content: fileContent2},
        ]
    }
    return [deployData, entity]
}

function validateHistoryEvent(deploymentEvent: DeploymentEvent, deployData: DeployData, entityBeingDeployed: ControllerEntity, creationTimestamp: Timestamp) {
    expect(deploymentEvent.entityId).toBe(deployData.entityId)
    expect(deploymentEvent.entityType).toBe(entityBeingDeployed.type)
    expect(deploymentEvent.timestamp).toBe(creationTimestamp)
}

async function validateReceivedData(receivedScenes: ControllerEntity[], deployData: DeployData, env: Environment) {
    expect(receivedScenes.length).toBe(1)
    const scene: ControllerEntity = receivedScenes[0]
    expect(scene.id).toBe(deployData.entityId)
    expect(scene.metadata).toBe("this is just some metadata")

    expect(scene.pointers.length).toBe(2)
    expect(scene.pointers[0]).toBe("0,0")
    expect(scene.pointers[1]).toBe("0,1")

    expect(scene.content?.length).toBe(2)
    expect(findInArray(scene.content, "the-file-1")).toBeDefined()
    expect(findInArray(scene.content, "the-file-2")).toBeDefined()

    expect(findInArray(deployData.files, findInArray(scene.content, "the-file-1")?.hash??"")).toBeDefined()
    expect(findInArray(deployData.files, findInArray(scene.content, "the-file-2")?.hash??"")).toBeDefined()

    scene.content?.forEach(async contentElement => {
        const response = await fetch(`http://localhost:${env.getConfig(SERVER_PORT)}/contents/${contentElement.hash}`)
        expect(response.ok).toBe(true)
        const downloadedContent = await response.buffer()
        expect(downloadedContent).toEqual(findInArray(deployData.files, contentElement.hash)?.content ?? Buffer.from([]))
    })
}

function findInArray<T extends {file: string}>(elements:T[]|undefined, key: string): T|undefined {
    return elements?.find(e => e.file===key);
}

function deleteFolderRecursive(pathToDelete) {
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
    files: {file: string, content: Buffer}[]
}