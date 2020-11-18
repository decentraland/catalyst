import { EntityType, Timestamp } from "dcl-catalyst-commons";
import { loadTestEnvironment } from "../E2ETestEnvironment";
import { MetaverseContentService } from "@katalyst/content/service/Service";
import { EntityCombo, buildDeployData, buildDeployDataAfterEntity, deployWithAuditInfo } from "../E2ETestUtils";


/**
 * This test verifies that the counter of deployments is correctly updated
 */
describe("Integration - Deployments counter", () => {

    const P1 = "x1,y1"
    const P2 = "x2,y2"
    const P3 = "x3,y3"
    let E1: EntityCombo, E2: EntityCombo, E3: EntityCombo
    const testEnv = loadTestEnvironment()

    let service: MetaverseContentService

    beforeAll(async () => {
        E1 = await buildDeployData([P1], { type: EntityType.PROFILE })
        E2 = await buildDeployDataAfterEntity(E1, [P2], { type: EntityType.SCENE })
        E3 = await buildDeployDataAfterEntity(E2, [P1, P2, P3], { type: EntityType.PROFILE })

    })

    beforeEach(async () => {
        service = await testEnv.buildService()
    })

    it(`When a new deployment is done, then the counter is updated`, async () => {
        // Deploy E1 and E2
        const [] = await deploy(E1, E2)

        // Assert that all the deployments are counted
        const amountOfDeployments: number = await service.getStatus().historySize
        expect(amountOfDeployments).toEqual(2)
    })


    it(`When a new deployment is done, then the counter is increased`, async () => {
        // Deploy E1 and E2
        const [] = await deploy(E1, E2)
        // Deploy E3
        const [] = await deploy(E3)

        // Assert that all the deployments are counted
        const amountOfDeployments: number = await service.getStatus().historySize
        expect(amountOfDeployments).toEqual(3)
    })


    async function deploy(...entities: EntityCombo[]): Promise<Timestamp[]> {
        return deployWithAuditInfo(service, entities, {})
    }
})
