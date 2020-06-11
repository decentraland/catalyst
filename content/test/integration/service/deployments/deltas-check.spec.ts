import { Pointer } from "@katalyst/content/service/Entity";
import { MetaverseContentService } from "@katalyst/content/service/Service";
import { DeploymentDeltaChanges } from "@katalyst/content/service/deployments/DeploymentManager";
import { loadTestEnvironment } from "../../E2ETestEnvironment";
import { buildEntityCombo, buildEntityComboAfter, EntityCombo } from "../../E2ETestUtils";

/**
 * This test verifies that the deltas are calculated correctly
 */
describe("Integration - Deltas Check", () => {

    const P1 = "x1,y1"
    const P2 = "x2,y2"
    const P3 = "x3,y3"
    let E1: EntityCombo, E2: EntityCombo, E3: EntityCombo, E4: EntityCombo

    const testEnv = loadTestEnvironment()
    let service: MetaverseContentService

    beforeAll(async () => {
        E1 = await buildEntityCombo([P1])
        E2 = await buildEntityComboAfter(E1, [P2])
        E3 = await buildEntityComboAfter(E2, [P1, P2, P3])
        E4 = await buildEntityComboAfter(E3, [P3])
    })

    beforeEach(async () => {
        service = await testEnv.buildService()
    })

    it('When an entity is deployed and set as active but it has no one to overwrite, then it is reported correctly', async () => {
        await deploy(E1)

        const changes = await getChangesInDeltaFor(E1)

        assertChangesAre(changes, [ P1, { before: undefined, after: E1 } ])
    })

    it('When an entity is deployed and set as active, and it overwrites others, then it is reported correctly', async () => {
        await deploy(E1, E3)

        const changes = await getChangesInDeltaFor(E3)

        assertChangesAre(changes,
            [ P1, { before: E1, after: E3 } ],
            [ P2, { before: undefined, after: E3 } ],
            [ P3, { before: undefined, after: E3 } ])
    })

    it('When an entity is deployed but set as inactive, and it has no one to overwrite, then it is reported correctly', async () => {
        await deploy(E3, E1)

        const changes = await getChangesInDeltaFor(E1)

        assertChangesAre(changes, )
    })

    it('When an entity is deployed but set as inactive, and it overwrites others, then it is reported correctly', async () => {
        await deploy(E1, E2, E4, E3)

        const changes = await getChangesInDeltaFor(E3)

        assertChangesAre(changes,
            [ P1, { before: E1, after: undefined }],
            [ P2, { before: E2, after: undefined }])
    })

    function assertChangesAre(changes: DeploymentDeltaChanges, ...expectedChanges: [Pointer, { before: EntityCombo | undefined, after: EntityCombo | undefined }][]) {
        const expectedChangesMap = new Map(expectedChanges.map(([ pointer, changes ]) => [ pointer, { before: changes.before?.entity?.id, after: changes.after?.entity?.id }]))
        expect(changes).toEqual(expectedChangesMap)
    }

    async function deploy(...entities: EntityCombo[]) {
        for (const { entity, files, auditInfo } of entities) {
            await service.deployEntity(files, entity.id, auditInfo, '')
        }
    }

    async function getChangesInDeltaFor(entityCombo: EntityCombo): Promise<DeploymentDeltaChanges> {
        const deltas = await service.getDeltas()
        const { changes } = deltas.filter(delta => delta.entityId === entityCombo.entity.id)[0]
        return changes
    }

})