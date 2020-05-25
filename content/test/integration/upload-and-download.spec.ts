import { Bean } from "@katalyst/content/Environment"
import { ControllerEntity } from "@katalyst/content/controller/Controller"
import { EntityType } from "@katalyst/content/service/Entity"
import { LegacyDeploymentEvent, LegacyDeploymentHistory } from "@katalyst/content/service/history/HistoryManager"
import { ContentFile } from "@katalyst/content/service/Service"
import { Timestamp } from "@katalyst/content/service/time/TimeSorting"
import { MockedSynchronizationManager } from "@katalyst/test-helpers/service/synchronization/MockedSynchronizationManager"
import { buildDeployData, DeployData } from "./E2ETestUtils"
import { TestServer } from "./TestServer"
import { assertPromiseRejectionIs } from "@katalyst/test-helpers/PromiseAssertions"
import { loadTestEnvironment } from "./E2ETestEnvironment"

describe("End 2 end deploy test", () => {

    const testEnv = loadTestEnvironment()
    let server: TestServer

    beforeEach(async () => {
        server = await testEnv.configServer()
            .withBean(Bean.SYNCHRONIZATION_MANAGER, new MockedSynchronizationManager())
            .andBuild()
        await server.start()
    })

    it('When a user tries to deploy the same entity twice, then an exception is thrown', async() => {
        // Build data for deployment
        const [deployData] = await buildDeployData(["0,0", "0,1"], "this is just some metadata")

        // Execute first deploy
        await server.deploy(deployData)

        // Try to re deploy, and fail
        await assertPromiseRejectionIs(() => server.deploy(deployData), "This entity was already deployed. You can't redeploy it")
    })

    it(`Deploy and retrieve some content`, async () => {
        //------------------------------
        // Deploy the content
        //------------------------------
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], "this is just some metadata", 'content/test/integration/resources/some-binary-file.png', 'content/test/integration/resources/some-text-file.txt')

        const creationTimestamp = await server.deploy(deployData)
        const deltaTimestamp = Date.now() - creationTimestamp
        expect(deltaTimestamp).toBeLessThanOrEqual(100)
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

        const [deploymentEvent]: LegacyDeploymentHistory = (await server.getHistory()).events
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

        expect(scene.content).toBeDefined()
        expect(scene.content!!.length).toBe(2)
        expect(findInArray(scene.content, deployData.files[1].name)).toBeDefined()
        expect(findInArray(scene.content, deployData.files[2].name)).toBeDefined()

        for (const contentElement of scene.content!!) {
            const downloadedContent = await server.downloadContent(contentElement.hash)
            expect(downloadedContent).toEqual(findInFileArray(deployData.files, contentElement.file)?.content ?? Buffer.from([]))
        }
    }

})

function validateHistoryEvent(deploymentEvent: LegacyDeploymentEvent, deployData: DeployData, entityBeingDeployed: ControllerEntity, creationTimestamp: Timestamp) {
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