import assert from "assert"
import { loadTestEnvironment } from "../../E2ETestEnvironment";
import { MetaverseContentService } from "@katalyst/content/service/Service";
import { EnvironmentBuilder, Bean, EnvironmentConfig } from "@katalyst/content/Environment";
import { NoOpValidations } from "@katalyst/test-helpers/service/validations/NoOpValidations";
import { GarbageCollectionManager } from "@katalyst/content/service/garbage-collection/GarbageCollectionManager";
import { EntityCombo, buildEntityCombo, buildEntityComboAfter, awaitUntil } from "../../E2ETestUtils";
import { ContentFileHash } from "@katalyst/content/service/Hashing";
import ms from "ms";
import { delay } from "decentraland-katalyst-utils/util";

describe("Integration - Garbage Collection", () => {

    const P1 = "X1,Y1", P2 = "X2,Y2"
    let E1: EntityCombo, E2: EntityCombo, E3: EntityCombo
    let onlyE1Content: ContentFileHash
    let sharedContent: ContentFileHash

    const testEnv = loadTestEnvironment()
    let service: MetaverseContentService
    let garbageCollector: GarbageCollectionManager

    beforeAll(async () => {
        E1 = await buildEntityCombo([P1], { contentPaths: ['content/test/integration/resources/some-binary-file.png', 'content/test/integration/resources/some-text-file.txt'] })
        E2 = await buildEntityComboAfter(E1, [P1], { contentPaths: ['content/test/integration/resources/some-binary-file.png'] });
        E3 = await buildEntityComboAfter(E2, [P2]);
        [ sharedContent, onlyE1Content ] = Array.from(E1.entity.content!!.values())
    })

    beforeEach(async () => {
        const baseEnv = await testEnv.getEnvForNewDatabase()
        const env = await new EnvironmentBuilder(baseEnv)
            .withConfig(EnvironmentConfig.GARBAGE_COLLECTION_INTERVAL, ms('2s'))
            .withConfig(EnvironmentConfig.GARBAGE_COLLECTION, 'true')
            .withConfig(EnvironmentConfig.LOG_LEVEL, 'debug')
            .withBean(Bean.VALIDATIONS, new NoOpValidations())
            .build()

        service = env.getBean(Bean.SERVICE)
        garbageCollector = env.getBean(Bean.GARBAGE_COLLECTION_MANAGER)
    })

    afterEach(async () => {
        await garbageCollector?.stop()
    })

    it(`When garbage collection is on, then unused content is deleted`, async () => {
        // Start garbage collection
        await garbageCollector.start()

        // Deploy E1
        await deploy(E1)

        // Assert all content is available
        await assertContentIsAvailable(sharedContent, onlyE1Content)

        // Deploy E2
        await deploy(E2)

        // Assert only the shared content is still available
        await awaitUntil(() => assertContentIsAvailable(sharedContent))
    })

    it(`When garbage collection is off, then unused content isn't deleted`, async () => {
        // Deploy E1
        await deploy(E1)

        // Assert all content is available
        await assertContentIsAvailable(sharedContent, onlyE1Content)

        // Deploy E2
        await deploy(E2)

        // Wait a little
        await delay(ms('4s'))

        // Assert all content is still available
        await assertContentIsAvailable(sharedContent, onlyE1Content)
    })

    it(`When garbage collection is started after deployments, then unused content is still deleted`, async () => {
        // Deploy E1 and E2
        await deploy(E1, E2)

        // Start garbage collection
        await garbageCollector.start()

        // Assert only the shared content is still available
        await awaitUntil(() => assertContentIsAvailable(sharedContent))
    })

    it(`When entity is overwritten, then it is sent to the garbage collector`, async () => {
        // Deploy E1
        await deploy(E1)

        // No overwrite reported
        assertReportedOverwritesAre(0)

        // Deploy E3
        await deploy(E3)

        // No overwrite reported, since E3 and E1 don't overlap
        assertReportedOverwritesAre(0)

        // Deploy E2
        await deploy(E2)

        // Overwrite reported
        assertReportedOverwritesAre(1)

        // Start garbage collection
        await garbageCollector.start()

        // Make sure it was garbage collected
        await awaitUntil(() => { assertReportedOverwritesAre(0); return Promise.resolve() })
    })

    function assertReportedOverwritesAre(amount: number) {
        assert.equal(garbageCollector.amountOfOverwrittenDeploymentsSinceLastSweep(), amount)
    }

    async function assertContentIsAvailable(...hashes: ContentFileHash[]) {
        const result = await service.isContentAvailable(hashes)
        const allAvailable = Array.from(result.values()).every(available => available)
        assert.ok(allAvailable)
    }

    async function deploy(...entityCombos: EntityCombo[]) {
        for (const entityCombo of entityCombos) {
            const { entity, files, auditInfo } = entityCombo
            await service.deployEntity(files, entity.id, auditInfo, '')
        }
    }

})