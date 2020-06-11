import ms from "ms"
import { ContentFileHash, Timestamp } from "dcl-catalyst-commons"
import { buildEvent, assertHistoryOnServerHasEvents, assertEntityIsNotDenylisted, assertContentNotIsDenylisted, assertFieldsOnEntitiesExceptIdsAreEqual, assertFileIsOnServer, assertEntityWasNotDeployed, assertDeploymentsAreReported, buildDeployment } from "../E2EAssertions"
import { EnvironmentConfig } from "@katalyst/content/Environment"
import { TestServer } from "../TestServer"
import { buildDeployData, createIdentity, awaitUntil } from "../E2ETestUtils"
import { loadTestEnvironment } from "../E2ETestEnvironment"
import { delay } from "decentraland-katalyst-utils/util"


describe("End 2 end - Denylist handling", () => {

    const identity = createIdentity()
    const SYNC_INTERVAL: number = ms("5s")
    const testEnv = loadTestEnvironment()
    let server1: TestServer, server2: TestServer, onboardingServer: TestServer

    beforeEach(async () => {
        [server1, server2, onboardingServer] = await testEnv.configServer(SYNC_INTERVAL)
            .withConfig(EnvironmentConfig.DECENTRALAND_ADDRESS, identity.address)
            .andBuildMany(3)
    })

    it(`When an entity is denylisted across all nodes, then no entity is deployed`, async () => {
        // Start server 1
        await server1.start()

        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], 'metadata')

        // Deploy the entity
        await server1.deploy(deployData)

        // Black list the entity
        await server1.denylistEntity(entityBeingDeployed, identity)

        // Start onboarding server
        await onboardingServer.start()

        // Wait for sync
        await delay(SYNC_INTERVAL * 2)

        // Assert there is nothing on history
        await assertHistoryOnServerHasEvents(onboardingServer, )
        await assertDeploymentsAreReported(onboardingServer, )

        // Assert it wasn't deployed
        await assertEntityWasNotDeployed(onboardingServer, entityBeingDeployed)
    });

    it(`When content is denylisted across all nodes, then no entity is deployed`, async () => {
        // Start server 1
        await server1.start()

        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], 'metadata', 'content/test/integration/resources/some-binary-file.png')
        const contentHash: ContentFileHash = entityBeingDeployed.content!![0].hash

        // Deploy the entity
        await server1.deploy(deployData)

        // Blacklist the entity
        await server1.denylistContent(contentHash, identity)

        // Start onboarding server
        await onboardingServer.start()

        // Wait for sync
        await delay(SYNC_INTERVAL * 2)

        // Assert there is nothing on history
        await assertHistoryOnServerHasEvents(onboardingServer, )
        await assertDeploymentsAreReported(onboardingServer, )

        // Assert it wasn't deployed
        await assertEntityWasNotDeployed(onboardingServer, entityBeingDeployed)
    });

    it(`When an entity is denylisted in some nodes, then onboarding node can still get it`, async () => {
        // Start server 1 and 2
        await Promise.all([server1.start(), server2.start()])

        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], 'metadata', 'content/test/integration/resources/some-binary-file.png')

        // Deploy the entity
        const deploymentTimestamp: Timestamp = await server1.deploy(deployData)
        const deploymentEvent = buildEvent(entityBeingDeployed, server1, deploymentTimestamp)
        const deployment = buildDeployment(deployData, entityBeingDeployed, server1, deploymentTimestamp)

        // Wait for servers to sync
        await awaitUntil(() => assertHistoryOnServerHasEvents(server2, deploymentEvent))
        await awaitUntil(() => assertDeploymentsAreReported(server2, deployment))

        // Black list the entity
        await server1.denylistEntity(entityBeingDeployed, identity)

        // Start onboarding server
        await onboardingServer.start()

        // Wait for servers to sync and assert entity is not denylisted on onboarding server
        await awaitUntil(() => assertEntityIsNotDenylisted(onboardingServer, entityBeingDeployed))

        // Assert on onboarding server has all history
        await assertHistoryOnServerHasEvents(onboardingServer, deploymentEvent)
        await assertDeploymentsAreReported(onboardingServer, deployment)

        // Assert the entity is retrieved correctly
        const entity = await onboardingServer.getEntityById(entityBeingDeployed.type, entityBeingDeployed.id)
        expect(entity).toEqual(entityBeingDeployed)

        // Assert entity file matches the deployed entity
        const fileContent = await onboardingServer.downloadContent(entity.id)
        assertFieldsOnEntitiesExceptIdsAreEqual(JSON.parse(fileContent.toString()), entityBeingDeployed)
    });

    it(`When content is denylisted in some nodes, then onboarding node can still get it`, async () => {
        // Start server 1 and 2
        await Promise.all([server1.start(), server2.start()])

        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], 'metadata', 'content/test/integration/resources/some-binary-file.png')
        const contentHash: ContentFileHash = entityBeingDeployed.content!![0].hash

        // Deploy the entity
        const deploymentTimestamp: Timestamp = await server1.deploy(deployData)
        const deploymentEvent = buildEvent(entityBeingDeployed, server1, deploymentTimestamp)
        const deployment = buildDeployment(deployData, entityBeingDeployed, server1, deploymentTimestamp)

        // Wait for servers to sync
        await awaitUntil(() => assertHistoryOnServerHasEvents(server2, deploymentEvent))
        await awaitUntil(() => assertDeploymentsAreReported(server2, deployment))

        // Black list the entity
        await server1.denylistContent(contentHash, identity)

        // Start onboarding server
        await onboardingServer.start()

        // Wait for servers to sync and assert content is not denylisted on onboarding server
        await awaitUntil(() => assertContentNotIsDenylisted(onboardingServer, entityBeingDeployed, contentHash))

        // Assert on onboarding server has all history
        await assertHistoryOnServerHasEvents(onboardingServer, deploymentEvent)
        await assertDeploymentsAreReported(onboardingServer, deployment)

        // Assert the entity is retrieved correctly
        const entity = await onboardingServer.getEntityById(entityBeingDeployed.type, entityBeingDeployed.id)
        expect(entity).toEqual(entityBeingDeployed)

        // Assert content is available
        await assertFileIsOnServer(onboardingServer, contentHash)
    });

})