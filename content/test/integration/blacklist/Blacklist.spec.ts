import { EnvironmentConfig, EnvironmentBuilder, Bean } from "@katalyst/content/Environment"
import { EntityType } from "@katalyst/content/service/Entity"
import { DenylistServiceDecorator } from "@katalyst/content/denylist/DenylistServiceDecorator"
import { buildDeployData, deleteServerStorage, createIdentity, Identity } from "../E2ETestUtils"
import { TestServer } from "../TestServer"
import { assertFileIsOnServer, assertEntityIsNotDenylisted, assertEntityIsDenylisted, assertFileIsNotOnServer, assertContentNotIsDenylisted, assertContentIsDenylisted, assertRequiredFieldsOnEntitiesAreEqual } from "../E2EAssertions"
import { ControllerEntityContent } from "@katalyst/content/controller/Controller"
import { MockedContentAnalytics } from "../../helpers/service/analytics/MockedContentAnalytics"
import { MockedSynchronizationManager } from "../../helpers/service/synchronization/MockedSynchronizationManager"
import { MockedAccessChecker } from "../../helpers/service/access/MockedAccessChecker"
import { assertPromiseIsRejected } from "@katalyst/test-helpers/PromiseAssertions"
import { mock, when, instance } from "ts-mockito"
import { ContentCluster } from "@katalyst/content/service/synchronization/ContentCluster"

describe("Integration - Denylist", () => {

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

    it(`When an entity is denylisted, then the metadata and content are hidden`, async () => {
        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], metadata, 'content/test/integration/resources/some-binary-file.png')

        // Deploy the entity
        await server.deploy(deployData)

        // Assert that the entity is not sanitized
        const entityOnServer = await server.getEntityById(EntityType[entityBeingDeployed.type.toUpperCase()], entityBeingDeployed.id)
        expect(entityOnServer).toEqual(entityBeingDeployed)

        // Assert that entity file is available
        await assertFileIsOnServer(server, entityBeingDeployed.id)

        // Assert that audit info doesn't say that it is denylisted
        await assertEntityIsNotDenylisted(server, entityBeingDeployed)

        // Denylist the entity
        await server.denylistEntity(entityBeingDeployed, decentralandIdentity)

        // Assert that entity has been sanitized
        const denylistedEntity = await server.getEntityById(EntityType[entityBeingDeployed.type.toUpperCase()], entityBeingDeployed.id)
        assertRequiredFieldsOnEntitiesAreEqual(denylistedEntity, entityBeingDeployed)
        expect(denylistedEntity.metadata).toBe(DenylistServiceDecorator.DENYLISTED_METADATA)
        expect(denylistedEntity.content).toBeUndefined()

        // Assert that entity file is not available
        await assertFileIsNotOnServer(server, entityBeingDeployed.id)

        // Assert that audit info marks the entity as denylisted
        await assertEntityIsDenylisted(server, entityBeingDeployed)
    });

    it(`When an entity is undenylisted, then it goes back to normal`, async () => {
        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], metadata, 'content/test/integration/resources/some-binary-file.png')

        // Deploy the entity
        await server.deploy(deployData)

        // Denylist the entity
        await server.denylistEntity(entityBeingDeployed, decentralandIdentity)

        // Assert that entity file is not available
        await assertEntityIsDenylisted(server, entityBeingDeployed)

        // Undenylist the entity
        await server.undenylistEntity(entityBeingDeployed, decentralandIdentity)

        // Assert that audit info marks the entity as denylisted
        await assertEntityIsNotDenylisted(server, entityBeingDeployed)

        // Assert that the entity is not sanitized
        const entityOnServer = await server.getEntityById(EntityType[entityBeingDeployed.type.toUpperCase()], entityBeingDeployed.id)
        expect(entityOnServer).toEqual(entityBeingDeployed)
    });

    it(`When content is denylisted, then the entity that contains it says so`, async () => {
        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], metadata, 'content/test/integration/resources/some-binary-file.png')
        const contentHash = (entityBeingDeployed.content as ControllerEntityContent[])[0].hash

        // Deploy the entity
        await server.deploy(deployData)

        // Assert that the content file is available
        await assertFileIsOnServer(server, contentHash)

        // Assert that the audit info doesn't mark content as denylisted
        await assertContentNotIsDenylisted(server, entityBeingDeployed, contentHash)

        // Denylist the content
        await server.denylistContent(contentHash, decentralandIdentity)

        // Assert that the content file is not available
        await assertFileIsNotOnServer(server, contentHash)

        // Assert that audit info marks content entity as denylisted
        await assertContentIsDenylisted(server, entityBeingDeployed, contentHash)
    });

    it(`When random identity tries to denylist an entity, then an error is thrown`, async () => {
        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], metadata)

        // Deploy the entity
        await server.deploy(deployData)

        // Denylist the entity
        await assertPromiseIsRejected(() => server.denylistEntity(entityBeingDeployed, createIdentity()))
    });

    it(`When random identity tries to denylist some content, then an error is thrown`, async () => {
        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], metadata, 'content/test/integration/resources/some-binary-file.png')
        const contentHash = (entityBeingDeployed.content as ControllerEntityContent[])[0].hash

        // Deploy the entity
        await server.deploy(deployData)

        // Denylist the content
        await assertPromiseIsRejected(() => server.denylistContent(contentHash, createIdentity()))
    });

    it(`When cluster owner tries to denylist content, then it is successful`, async () => {
        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], metadata)

        // Deploy the entity
        await server.deploy(deployData)

        // Denylist the entity
        await server.denylistEntity(entityBeingDeployed, ownerIdentity)

        // Assert that audit info marks the entity as denylisted
        await assertEntityIsDenylisted(server, entityBeingDeployed)
    })

    it(`When cluster owner tries to denylist an entity, then it is successful`, async () => {
        // Prepare entity to deploy
        const [deployData, entityBeingDeployed] = await buildDeployData(["0,0", "0,1"], metadata, 'content/test/integration/resources/some-binary-file.png')
        const contentHash = (entityBeingDeployed.content as ControllerEntityContent[])[0].hash

        // Deploy the entity
        await server.deploy(deployData)

        // Denylist the content
        await server.denylistContent(contentHash, ownerIdentity)

        // Assert that audit info marks content entity as denylisted
        await assertContentIsDenylisted(server, entityBeingDeployed, contentHash)
    })

})

function mockedClusterWithIdentityAsOwn(identity: Identity) {
    let mockedCluster: ContentCluster = mock(ContentCluster)
    when(mockedCluster.getOwnIdentity()).thenReturn({ owner: identity.address, address: "", id: "" })
    return instance(mockedCluster)
}