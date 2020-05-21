import { EntityType, Pointer } from "@katalyst/content/service/Entity";
import { loadTestEnvironment } from "../E2ETestEnvironment";
import { Bean, EnvironmentBuilder } from "@katalyst/content/Environment";
import { MigrationManager } from "@katalyst/content/migrations/MigrationManager";
import { MetaverseContentService, ContentFile } from "@katalyst/content/service/Service";
import { AuditInfoBase, EntityVersion } from "@katalyst/content/service/Audit";
import { buildControllerEntityAndFile } from "@katalyst/test-helpers/controller/ControllerEntityTestFactory";
import { ControllerEntity } from "@katalyst/content/controller/Controller";
import { parseEntityType } from "../E2ETestUtils";
import { NoOpValidations } from "@katalyst/test-helpers/service/validations/NoOpValidations";

/**
 * This test verifies that the active entity and overwrites are calculated correctly, regardless of the order in which the entities where deployed.
 */
describe("Integration - Order Check", () => {

    const P1 = "X1,Y1"
    const P2 = "X2,Y2"
    const P3 = "X3,Y3"
    const P4 = "X4,Y4"
    const type = EntityType.PROFILE
    let E1: EntityCombo, E2: EntityCombo, E3: EntityCombo, E4: EntityCombo, E5: EntityCombo

    let allEntities: EntityCombo[]

    const testEnv = loadTestEnvironment()
    let service: MetaverseContentService

    beforeAll(async () => {
        E1 = await buildEntityCombo(P1)
        E2 = await buildEntityComboAfter(E1, P2)
        E3 = await buildEntityComboAfter(E2, P1, P2, P3)
        E4 = await buildEntityComboAfter(E3, P1, P3, P4)
        E5 = await buildEntityComboAfter(E4, P2, P4)
        allEntities = [ E1, E2, E3, E4, E5 ]
        allEntities.forEach(({ entity }, idx) => console.log(`E${idx + 1}: ${entity.id}`))
    })

    beforeEach(async () => {
        const baseEnv = await testEnv.getEnvForNewDatabase()
        const env = await new EnvironmentBuilder(baseEnv)
            .withBean(Bean.VALIDATIONS, new NoOpValidations())
            .build()
        const migrationManager = env.getBean<MigrationManager>(Bean.MIGRATION_MANAGER)
        await migrationManager.run()
        service = env.getBean(Bean.SERVICE)
    })

    permutator([0, 1, 2, 3, 4])
        .forEach(function(indices) {
            const names = indices.map((idx) => `E${idx + 1}`).join(' -> ')
            it(names, async done =>  {
                const entityCombos = indices.map(idx => allEntities[idx])
                await commit(entityCombos);
                await assertCommitsWhereDoneCorrectly()
                done();
            });
    });

    async function assertCommitsWhereDoneCorrectly() {
        // Assert only E5 is active
        const activeEntities = await service.getEntitiesByPointers(type, [P1, P2, P3, P4])
        expect(activeEntities.length).toEqual(1)
        const activeEntity = activeEntities[0]
        expect(activeEntity.id).toEqual(E5.entity.id)

        // Assert there is no entity on P1 and P3
        const noEntities = await service.getEntitiesByPointers(type, [P1, P3])
        expect(noEntities.length).toEqual(0)

        await assertOverwrittenBy(E1, E3)
        await assertOverwrittenBy(E2, E3)
        await assertOverwrittenBy(E3, E4)
        await assertOverwrittenBy(E4, E5)
        await assertNotOverwritten(E5)
    }

    async function commit(entities: EntityCombo[]) {
        for (const { entity, entityFile, auditInfo } of entities) {
            await service.deployEntity([entityFile], entity.id, auditInfo, '')
        }
    }

    async function assertOverwrittenBy(overwritten: EntityCombo, overwrittenBy: EntityCombo) {
        const auditInfo = await service.getAuditInfo(parseEntityType(overwritten.entity), overwritten.entity.id)
        expect(auditInfo?.overwrittenBy).toEqual(overwrittenBy.entity.id)
    }

    async function assertNotOverwritten(entity: EntityCombo) {
        const auditInfo = await service.getAuditInfo(parseEntityType(entity.entity), entity.entity.id)
        expect(auditInfo?.overwrittenBy).toBeUndefined()
    }

    async function buildEntityCombo(...pointers: Pointer[]): Promise<EntityCombo> {
        return buildEntityComboAfter(undefined, ...pointers)
    }

    async function buildEntityComboAfter(entityCombo?: EntityCombo, ...pointers: Pointer[]): Promise<EntityCombo> {
        const timestamp = entityCombo ? entityCombo.entity.timestamp + 1 : Date.now()
        const [ entity, entityFile ] = await buildControllerEntityAndFile(type, pointers, timestamp)
        const auditInfo: AuditInfoBase = { version: EntityVersion.V2, authChain: [] }
        return {
            entity,
            entityFile,
            auditInfo
        }
    }

    function permutator<T>(array: Array<T>): Array<Array<T>> {
        let result: Array<Array<T>> = [];

        const permute = (arr:  Array<T>, m:  Array<T> = []) => {
            if (arr.length === 0) {
                result.push(m)
            } else {
                for (let i = 0; i < arr.length; i++) {
                    let curr = arr.slice();
                    let next = curr.splice(i, 1);
                    permute(curr.slice(), m.concat(next))
                }
            }
        }
        permute(array)
        return result;
    }

})

type EntityCombo = {
    entity: ControllerEntity,
    entityFile: ContentFile,
    auditInfo: AuditInfoBase,
}