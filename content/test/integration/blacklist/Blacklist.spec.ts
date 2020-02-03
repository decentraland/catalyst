import { EnvironmentConfig, EnvironmentBuilder, Bean } from "@katalyst/content/Environment"
import { EntityType } from "@katalyst/content/service/Entity"
import { BlacklistServiceDecorator } from "@katalyst/content/blacklist/BlacklistServiceDecorator"
import { buildDeployData, deleteServerStorage, createIdentity, Identity } from "../E2ETestUtils"
import { TestServer } from "../TestServer"
import { assertFileIsOnServer, assertEntityIsNotBlacklisted, assertEntityIsBlacklisted, assertFileIsNotOnServer, assertContentNotIsBlacklisted, assertContentIsBlacklisted, assertRequiredFieldsOnEntitiesAreEqual } from "../E2EAssertions"
import { ControllerEntityContent } from "@katalyst/content/controller/Controller"
import { MockedContentAnalytics } from "../../helpers/service/analytics/MockedContentAnalytics"
import { MockedSynchronizationManager } from "../../helpers/service/synchronization/MockedSynchronizationManager"
import { MockedAccessChecker } from "../../helpers/service/access/MockedAccessChecker"
import { assertPromiseIsRejected } from "@katalyst/test-helpers/PromiseAssertions"
import { mock, when, instance } from "ts-mockito"
import { ContentCluster } from "@katalyst/content/service/synchronization/ContentCluster"

describe("Integration - Blacklist", () => {

    const metadata: string = "Some metadata"
    const decentralandIdentity = createIdentity()
    const ownerIdentity = createIdentity()
    let server: TestServer

    beforeEach(async () => {
        const env = await new EnvironmentBuilder()
            .withAnalytics(new MockedContentAnalytics())
            .withSynchronizationManager(new MockedSynchronizationManager())
            .withAccessChecker(new MockedAccessChecker())
            .withBean(Bean.CONTENT_CLUSTER, mockedClusterWithIdentityAsOwn(ownerIdentity))
            .withConfig(EnvironmentConfig.METRICS, false)
            .withConfig(EnvironmentConfig.DECENTRALAND_ADDRESS, decentralandIdentity.address)
            .build()
        server = new TestServer(env)
        await server.start()
    })

    afterEach(async () => {
        await server.stop()
        deleteServerStorage(server)
    })

    it(`When an entity is blacklisted, then the metadata and content are hidden`, async () => {
        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], metadata, 'content/test/integration/resources/some-binary-file.png')

        // Deploy the entity
        await server.deploy(deployData)

        // Assert that the entity is not sanitized
        const entityOnServer = await server.getEntityById(EntityType[entityBeingDeployed.type.toUpperCase()], entityBeingDeployed.id)
        expect(entityOnServer).toEqual(entityBeingDeployed)

        // Assert that entity file is available
        await assertFileIsOnServer(server, entityBeingDeployed.id)

        // Assert that audit info doesn't say that it is blacklisted
        await assertEntityIsNotBlacklisted(server, entityBeingDeployed)

        // Blacklist the entity
        await server.blacklistEntity(entityBeingDeployed, decentralandIdentity)

        // Assert that entity has been sanitized
        const blacklistedEntity = await server.getEntityById(EntityType[entityBeingDeployed.type.toUpperCase()], entityBeingDeployed.id)
        assertRequiredFieldsOnEntitiesAreEqual(blacklistedEntity, entityBeingDeployed)
        expect(blacklistedEntity.metadata).toBe(BlacklistServiceDecorator.BLACKLISTED_METADATA)
        expect(blacklistedEntity.content).toBeUndefined()

        // Assert that entity file is not available
        await assertFileIsNotOnServer(server, entityBeingDeployed.id)

        // Assert that audit info marks the entity as blacklisted
        await assertEntityIsBlacklisted(server, entityBeingDeployed)
    });

    it(`When an entity is unblacklisted, then it goes back to normal`, async () => {
        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], metadata, 'content/test/integration/resources/some-binary-file.png')

        // Deploy the entity
        await server.deploy(deployData)

        // Blacklist the entity
        await server.blacklistEntity(entityBeingDeployed, decentralandIdentity)

        // Assert that entity file is not available
        await assertEntityIsBlacklisted(server, entityBeingDeployed)

        // Unblacklist the entity
        await server.unblacklistEntity(entityBeingDeployed, decentralandIdentity)

        // Assert that audit info marks the entity as blacklisted
        await assertEntityIsNotBlacklisted(server, entityBeingDeployed)

        // Assert that the entity is not sanitized
        const entityOnServer = await server.getEntityById(EntityType[entityBeingDeployed.type.toUpperCase()], entityBeingDeployed.id)
        expect(entityOnServer).toEqual(entityBeingDeployed)
    });

    it(`When content is blacklisted, then the entity that contains it says so`, async () => {
        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], metadata, 'content/test/integration/resources/some-binary-file.png')
        const contentHash = (entityBeingDeployed.content as ControllerEntityContent[])[0].hash

        // Deploy the entity
        await server.deploy(deployData)

        // Assert that the content file is available
        await assertFileIsOnServer(server, contentHash)

        // Assert that the audit info doesn't mark content as blacklisted
        await assertContentNotIsBlacklisted(server, entityBeingDeployed, contentHash)

        // Blacklist the content
        await server.blacklistContent(contentHash, decentralandIdentity)

        // Assert that the content file is not available
        await assertFileIsNotOnServer(server, contentHash)

        // Assert that audit info marks content entity as blacklisted
        await assertContentIsBlacklisted(server, entityBeingDeployed, contentHash)
    });

    it(`When random identity tries to blacklist an entity, then an error is thrown`, async () => {
        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], metadata)

        // Deploy the entity
        await server.deploy(deployData)

        // Blacklist the entity
        assertPromiseIsRejected(() => server.blacklistEntity(entityBeingDeployed, createIdentity()))
    });

    it(`When random identity tries to blacklist some content, then an error is thrown`, async () => {
        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], metadata, 'content/test/integration/resources/some-binary-file.png')
        const contentHash = (entityBeingDeployed.content as ControllerEntityContent[])[0].hash

        // Deploy the entity
        await server.deploy(deployData)

        // Blacklist the content
        assertPromiseIsRejected(() => server.blacklistContent(contentHash, createIdentity()))
    });

    it(`When cluster owner tries to blacklist content, then it is successful`, async () => {
        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], metadata)

        // Deploy the entity
        await server.deploy(deployData)

        // Blacklist the entity
        await server.blacklistEntity(entityBeingDeployed, ownerIdentity)

        // Assert that audit info marks the entity as blacklisted
        await assertEntityIsBlacklisted(server, entityBeingDeployed)
    })

    it(`When cluster owner tries to blacklist an entity, then it is successful`, async () => {
        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], metadata, 'content/test/integration/resources/some-binary-file.png')
        const contentHash = (entityBeingDeployed.content as ControllerEntityContent[])[0].hash

        // Deploy the entity
        await server.deploy(deployData)

        // Blacklist the content
        await server.blacklistContent(contentHash, ownerIdentity)

        // Assert that audit info marks content entity as blacklisted
        await assertContentIsBlacklisted(server, entityBeingDeployed, contentHash)
    })

})

function mockedClusterWithIdentityAsOwn(identity: Identity) {
    let mockedCluster: ContentCluster = mock(ContentCluster)
    when(mockedCluster.getOwnIdentity()).thenReturn({ owner: identity.address, address: "", id: "" })
    return instance(mockedCluster)
}