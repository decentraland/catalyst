import { random } from "faker"
import { EntityType, Entity, Pointer, EntityId } from "@katalyst/content/service/Entity";
import { PointerDeploymentsRecord, CommitResult } from "@katalyst/content/service/pointers/PointerDeploymentsRecord";

describe("PointerDeploymentsRecord", () => {

    const P1 = "X1,Y1"
    const P2 = "X2,Y2"
    const P3 = "X3,Y3"
    const P4 = "X4,Y4"
    const type = EntityType.PROFILE
    const entity1: Entity = buildEntity(P1)
    const entity2: Entity = buildEntityAfter(entity1, P2)
    const entity3: Entity = buildEntityAfter(entity2, P1, P2, P3)
    const entity4: Entity = buildEntityAfter(entity3, P1, P3, P4)
    const entity5: Entity = buildEntityAfter(entity4, P2, P4)

    let storage: Map<Pointer, EntityId>

    beforeEach(() => {
        storage = new Map()
    })

    it(`E1 -> E3 -> E5`, async () => {
        const record = recordWith(emptyStorage())

        const commitResult1 = await commit(record, entity1);
        assertNoOverwrites(commitResult1)
        assertCommitted(commitResult1)
        assertNoDeletedPointers(commitResult1)

        const commitResult3 = await commit(record, entity3);
        assertOverwrote(commitResult3, overwrite(entity3, entity1))
        assertCommitted(commitResult3)
        assertDeletedPointers(commitResult3, ...entity1.pointers)

        const commitResult5 = await commit(record, entity5);
        assertOverwrote(commitResult5, overwrite(entity5, entity3))
        assertCommitted(commitResult5)
        assertDeletedPointers(commitResult5, ...entity3.pointers)
    });

    it(`E1 -> E5 -> E3`, async () => {
        const record = recordWith(emptyStorage())

        const commitResult1 = await commit(record, entity1);
        assertNoOverwrites(commitResult1)
        assertCommitted(commitResult1)
        assertNoDeletedPointers(commitResult1)

        const commitResult5 = await commit(record, entity5);
        assertNoOverwrites(commitResult5)
        assertCommitted(commitResult5)
        assertNoDeletedPointers(commitResult5)

        const commitResult3 = await commit(record, entity3);
        assertOverwrote(commitResult3, overwrite(entity5, entity3), overwrite(entity3, entity1))
        assertDidNotCommit(commitResult3)
        assertDeletedPointers(commitResult3, ...entity1.pointers)
    });

    it(`E3 -> E5 -> E1`, async () => {
        const record = recordWith(emptyStorage())

        const commitResult3 = await commit(record, entity3);
        assertNoOverwrites(commitResult3)
        assertCommitted(commitResult3)
        assertNoDeletedPointers(commitResult3)

        const commitResult5 = await commit(record, entity5);
        assertOverwrote(commitResult5, overwrite(entity5, entity3))
        assertCommitted(commitResult5)
        assertDeletedPointers(commitResult5, ...entity3.pointers)

        const commitResult1 = await commit(record, entity1);
        assertOverwrote(commitResult1, overwrite(entity3, entity1))
        assertDidNotCommit(commitResult1)
        assertNoDeletedPointers(commitResult1)
    });

    it(`E5 -> E3 -> E1`, async () => {
        const record = recordWith(emptyStorage())

        const commitResult5 = await commit(record, entity5);
        assertNoOverwrites(commitResult5)
        assertCommitted(commitResult5)
        assertNoDeletedPointers(commitResult5)

        const commitResult3 = await commit(record, entity3);
        assertOverwrote(commitResult3, overwrite(entity5, entity3))
        assertDidNotCommit(commitResult3)
        assertNoDeletedPointers(commitResult3)

        const commitResult1 = await commit(record, entity1);
        assertOverwrote(commitResult1, overwrite(entity3, entity1))
        assertDidNotCommit(commitResult1)
        assertNoDeletedPointers(commitResult1)
    });

    it(`E5 -> E1 -> E3`, async () => {
        const record = recordWith(emptyStorage())

        const commitResult5 = await commit(record, entity5);
        assertNoOverwrites(commitResult5)
        assertCommitted(commitResult5)
        assertNoDeletedPointers(commitResult5)

        const commitResult1 = await commit(record, entity1);
        assertNoOverwrites(commitResult1)
        assertCommitted(commitResult1)
        assertNoDeletedPointers(commitResult1)

        const commitResult3 = await commit(record, entity3);
        assertOverwrote(commitResult3, overwrite(entity3, entity1), overwrite(entity5, entity3))
        assertDidNotCommit(commitResult3)
        assertDeletedPointers(commitResult3, ...entity1.pointers)
    });

    it(`E1 -> E2 -> E4 -> E5 -> E3`, async () => {
        const record = recordWith(emptyStorage())

        const commitResult1 = await commit(record, entity1);
        assertNoOverwrites(commitResult1)
        assertCommitted(commitResult1)
        assertNoDeletedPointers(commitResult1)

        const commitResult2 = await commit(record, entity2);
        assertNoOverwrites(commitResult2)
        assertCommitted(commitResult2)
        assertNoDeletedPointers(commitResult2)

        const commitResult4 = await commit(record, entity4);
        assertOverwrote(commitResult4, overwrite(entity4, entity1))
        assertCommitted(commitResult4)
        assertDeletedPointers(commitResult4, ...entity1.pointers)

        const commitResult5 = await commit(record, entity5);
        assertOverwrote(commitResult5, overwrite(entity5, entity2, entity4))
        assertCommitted(commitResult5)
        assertDeletedPointers(commitResult5, ...entity2.pointers, ...entity4.pointers)

        const commitResult3 = await commit(record, entity3);
        assertOverwrote(commitResult3, overwrite(entity4, entity3), overwrite(entity3, entity1, entity2))
        assertDidNotCommit(commitResult3)
        assertNoDeletedPointers(commitResult3)
    });

    it(`E1 -> E2 -> E4 -> E3 -> E5`, async () => {
        const record = recordWith(emptyStorage())

        const commitResult1 = await commit(record, entity1);
        assertNoOverwrites(commitResult1)
        assertCommitted(commitResult1)
        assertNoDeletedPointers(commitResult1)

        const commitResult2 = await commit(record, entity2);
        assertNoOverwrites(commitResult2)
        assertCommitted(commitResult2)
        assertNoDeletedPointers(commitResult2)

        const commitResult4 = await commit(record, entity4);
        assertOverwrote(commitResult4, overwrite(entity4, entity1))
        assertCommitted(commitResult4)
        assertDeletedPointers(commitResult4, ...entity1.pointers)

        const commitResult3 = await commit(record, entity3);
        assertOverwrote(commitResult3, overwrite(entity4, entity3), overwrite(entity3, entity1, entity2))
        assertDidNotCommit(commitResult3)
        assertDeletedPointers(commitResult3, ...entity2.pointers)

        const commitResult5 = await commit(record, entity5);
        assertOverwrote(commitResult5, overwrite(entity5, entity4))
        assertCommitted(commitResult5)
        assertDeletedPointers(commitResult5, ...entity4.pointers)
    });

    function buildEntity(...pointers: Pointer[]): Entity {
        return new Entity(random.alphaNumeric(10), type, pointers, random.number())
    }

    function buildEntityAfter(entity: Entity, ...pointers: Pointer[]): Entity {
        return new Entity(random.alphaNumeric(10), type, pointers, entity.timestamp + 1)
    }

    function recordWith(externalStorage: (entityType: EntityType, pointer: Pointer) => Promise<EntityId | undefined>) {
        return new PointerDeploymentsRecord(externalStorage, undefined)
    }

    // Just a rename for clarity
    function emptyStorage() {
        return externalStorageWith()
    }

    function externalStorageWith(...entities: Entity[]): (entityType: EntityType, pointer: Pointer) => Promise<EntityId | undefined> {
        entities.forEach(entity => entity.pointers.forEach(pointer => storage.set(pointer, entity.id)))
        return (entityType: EntityType, pointer: Pointer) => Promise.resolve(storage.get(pointer))
    }

    function assertNoDeletedPointers(result: CommitResult) {
        expect(result.deletedPointers.size).toBe(0)
    }

    function assertDeletedPointers(result: CommitResult, ...pointers: Pointer[]) {
        expect(result.deletedPointers.size).toBe(pointers.length)
        pointers.forEach(pointer => expect(result.deletedPointers.has(pointer)).toBeTruthy())
    }

    function assertCommitted(result: CommitResult) {
        expect(result.committed).toBeTruthy()
    }

    function assertDidNotCommit(result: CommitResult) {
        expect(result.committed).toBeFalsy()
    }

    function assertNoOverwrites(result: CommitResult) {
        expect(result.overwrites.size).toBe(0)
    }

    function assertOverwrote(result: CommitResult, ...overwrites: Overwrite[]) {
        const totalOverwrites = overwrites.reduce((accum, currentValue) => accum + currentValue.overwrittenEntities.length, 0)
        expect(result.overwrites.size).toBe(totalOverwrites)
        overwrites.forEach(overwrite => overwrite.overwrittenEntities.forEach(overwrittenEntity => expect(result.overwrites.get(overwrittenEntity.id)).toEqual(overwrite.overwrittenBy.id)))
    }

    function overwrite(overwrittenBy: Entity, ...overwrittenEntities: Entity[]): Overwrite {
        return {
            overwrittenEntities,
            overwrittenBy
        }
    }

    async function commit(record: PointerDeploymentsRecord, entity: Entity) {
        const fetcher = (entityId: EntityId) => {
            return Promise.resolve([entity1, entity2, entity3, entity4, entity5].find(entity => entity.id == entityId))
        }
        const result = await record.exerciseCommit(entity, Math.random(), fetcher);
        result.deletedPointers.forEach(pointer => storage.delete(pointer))
        if (result.committed) {
            entity.pointers.forEach(pointer => storage.set(pointer, entity.id))
        }
        return result
    }

})

type Overwrite = {
    overwrittenBy: Entity,
    overwrittenEntities: Entity[]
}

