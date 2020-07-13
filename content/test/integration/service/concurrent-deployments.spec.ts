import { EntityType } from "dcl-catalyst-commons";
import { loadTestEnvironment } from "../E2ETestEnvironment";
import { MetaverseContentService } from "@katalyst/content/service/Service";
import { EntityCombo, buildDeployData, deployEntitiesCombo } from "../E2ETestUtils";


/**
 * This test verifies that if concurrent deployments are made, then only one remains as active
 */
describe("Integration - Concurrent deployments", () => {

    const P1 = "x1,y1"
    const AMOUNT_OF_DEPLOYMENTS = 10
    const type = EntityType.PROFILE
    const testEnv = loadTestEnvironment()

    let entities: EntityCombo[]
    let service: MetaverseContentService

    beforeAll(async () => {
        entities = []
        for (let i = 0; i < AMOUNT_OF_DEPLOYMENTS; i++) {
            entities[i] = await buildDeployData([P1], { type })
        }
    })

    beforeEach(async () => {
        service = await testEnv.buildService()
    })

    it(`When deployments are executed concurrently, then only one remains active`, async () => {
        // Perform all the deployments concurrently
        await Promise.all(entities.map(entityCombo => deployEntity(entityCombo)))

        // Assert that only one is active
        const { deployments } = await service.getDeployments( { pointers: [P1], onlyCurrentlyPointed: true} )
        expect(deployments.length).toEqual(1)
    })

    async function deployEntity(entity: EntityCombo) {
        try {
            await deployEntitiesCombo(service, entity)
        } catch (error) {
            if (error.message !== `The following pointers are currently being deployed: '${P1}'. Please try again in a few seconds.`) {
                throw error
            }
        }
    }

})
