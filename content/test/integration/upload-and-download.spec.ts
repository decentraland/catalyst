import { EnvironmentBuilder } from "@katalyst/content/Environment"
import { ControllerEntity } from "@katalyst/content/controller/Controller"
import { EntityType } from "@katalyst/content/service/Entity"
import { DeploymentEvent, DeploymentHistory } from "@katalyst/content/service/history/HistoryManager"
import { Timestamp, ContentFile } from "@katalyst/content/service/Service"
import { MockedContentAnalytics } from "content/test/helpers/service/analytics/MockedContentAnalytics"
import { MockedSynchronizationManager } from "content/test/helpers/service/synchronization/MockedSynchronizationManager"
import { MockedAccessChecker } from "content/test/helpers/service/access/MockedAccessChecker"
import { buildDeployData, deleteServerStorage, DeployData } from "./E2ETestUtils"
import { TestServer } from "./TestServer"

describe("End 2 end deploy test", () => {

    let server: TestServer

    beforeAll(async () => {
        const env = await new EnvironmentBuilder()
            .withAnalytics(new MockedContentAnalytics())
            .withSynchronizationManager(new MockedSynchronizationManager())
            .withAccessChecker(new MockedAccessChecker())
            .build()
        server = new TestServer(env)
        await server.start()
    })

    afterAll(() => {
        server.stop()
        deleteServerStorage(server)
    })


    it(`Deploy and retrieve some content`, async () => {
        //------------------------------
        // Deploy the content
        //------------------------------
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], "this is just some metadata", 'content/test/end2end/resources/some-binary-file.png', 'content/test/end2end/resources/some-text-file.txt')

        const creationTimestamp = await server.deploy(deployData)
        const deltaTimestamp = Date.now() - creationTimestamp
        expect(deltaTimestamp).toBeLessThanOrEqual(50)
        expect(deltaTimestamp).toBeGreaterThanOrEqual(0)

        //------------------------------
        // Retrieve the entity by id
        //------------------------------
        const scenesById: ControllerEntity[] = await server.getEntitiesByIds(EntityType.SCENE, deployData.entityId)
        await validateReceivedData(scenesById, deployData)

        //------------------------------
        // Retrieve the entity by pointer
        //------------------------------
        const scenesByPointer: ControllerEntity[] = await server.getEntitiesByPointers(EntityType.SCENE, ["0,0"])
        await validateReceivedData(scenesByPointer, deployData)

        const [deploymentEvent]: DeploymentHistory = await server.getHistory()
        validateHistoryEvent(deploymentEvent, deployData, entityBeingDeployed, creationTimestamp)
    });

    async function validateReceivedData(receivedScenes: ControllerEntity[], deployData: DeployData) {
        expect(receivedScenes.length).toBe(1)
        const scene: ControllerEntity = receivedScenes[0]
        expect(scene.id).toBe(deployData.entityId)
        expect(scene.metadata).toBe("this is just some metadata")

        expect(scene.pointers.length).toBe(2)
        expect(scene.pointers[0]).toBe("0,0")
        expect(scene.pointers[1]).toBe("0,1")

        expect(scene.content?.length).toBe(2)
        expect(findInArray(scene.content, deployData.files[1].name)).toBeDefined()
        expect(findInArray(scene.content, deployData.files[2].name)).toBeDefined()

        scene.content?.forEach(async contentElement => {
            const downloadedContent = await server.downloadContent(contentElement.hash)
            expect(downloadedContent).toEqual(findInFileArray(deployData.files, contentElement.file)?.content ?? Buffer.from([]))
        })
    }

})

function validateHistoryEvent(deploymentEvent: DeploymentEvent, deployData: DeployData, entityBeingDeployed: ControllerEntity, creationTimestamp: Timestamp) {
    expect(deploymentEvent.entityId).toBe(deployData.entityId)
    expect(deploymentEvent.entityType).toBe(entityBeingDeployed.type)
    expect(deploymentEvent.timestamp).toBe(creationTimestamp)
}

function findInArray<T extends { file: string }>(elements: T[] | undefined, key: string): T | undefined {
    return elements?.find(e => e.file === key);
}

function findInFileArray(elements: ContentFile[] | undefined, key: string): ContentFile | undefined {
    return elements?.find(e => e.name === key);
}