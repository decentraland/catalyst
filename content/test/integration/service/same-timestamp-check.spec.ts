import { EntityType } from "dcl-catalyst-commons";
import { loadTestEnvironment } from "../E2ETestEnvironment";
import { MetaverseContentService } from "@katalyst/content/service/Service";
import { EntityCombo, buildDeployData, deployEntitiesCombo } from "../E2ETestUtils";


/**
 * This test verifies that the entities with the same entity timestamp are deployed correctly
 */
describe("Integration - Same Timestamp Check", () => {

    const P1 = "X1,Y1"
    const type = EntityType.PROFILE
    let oldestEntity: EntityCombo, newestEntity: EntityCombo

    const testEnv = loadTestEnvironment()
    let service: MetaverseContentService

    beforeAll(async () => {
        const timestamp = Date.now()
        const e1 = await buildDeployData([P1], { type, timestamp, metadata: 'metadata1' })
        const e2 = await buildDeployData([P1], { type, timestamp, metadata: 'metadata2' })
        if (e1.entity.id.toLowerCase() < e2.entity.id.toLowerCase()) {
            oldestEntity = e1
            newestEntity = e2
        } else {
            oldestEntity = e2
            newestEntity = e1
        }
    })

    beforeEach(async () => {
        service = await testEnv.buildService()
    })

    it(`When oldest is deployed first, they overwrites are calculated correctly correctly`, async () => {
        // Deploy the entities
        await deployEntitiesCombo(service, oldestEntity)
        await deployEntitiesCombo(service, newestEntity)

        // Verify overwrites
        await assertOverwrittenBy(oldestEntity, newestEntity)
        await assertNotOverwritten(newestEntity)

        // Assert newest entity is active
        await assertIsActive(newestEntity)
    })

    it(`When newest is deployed first, they overwrites are calculated correctly correctly`, async () => {
        // Deploy the entities
        await deployEntitiesCombo(service, newestEntity)
        await deployEntitiesCombo(service, oldestEntity)

        // Verify overwrites
        await assertOverwrittenBy(oldestEntity, newestEntity)
        await assertNotOverwritten(newestEntity)

        // Assert newest entity is active
        await assertIsActive(newestEntity)
    })

    async function assertIsActive(entityCombo: EntityCombo) {
        const activeEntities = await service.getEntitiesByPointers(type, [P1])
        expect(activeEntities.length).toEqual(1)
        const activeEntity = activeEntities[0]
        expect(activeEntity.id).toEqual(entityCombo.entity.id)
    }

    async function assertOverwrittenBy(overwritten: EntityCombo, overwrittenBy: EntityCombo) {
        const auditInfo = await service.getAuditInfo(overwritten.entity.type, overwritten.entity.id)
        expect(auditInfo?.overwrittenBy).toEqual(overwrittenBy.entity.id)
    }

    async function assertNotOverwritten(entity: EntityCombo) {
        const auditInfo = await service.getAuditInfo(entity.entity.type, entity.entity.id)
        expect(auditInfo?.overwrittenBy).toBeUndefined()
    }

})
