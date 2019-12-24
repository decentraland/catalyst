import { random } from "faker"
import { EntityType, Entity, Pointer } from "../../../src/service/Entity";
import { MockedStorage } from "../../storage/MockedStorage";
import { PointerStorage } from "../../../src/service/pointers/PointerStorage";
import { PointerManager, CommitResult } from "../../../src/service/pointers/PointerManager";

describe("PointerManager", () => {

    const P1 = "X1,Y1"
    const P2 = "X2,Y2"
    const P3 = "X3,Y3"
    const P4 = "X4,Y4"
    const type = EntityType.PROFILE
    const entity1: Entity = buildEntity(P1, P2)
    const entity2: Entity = buildEntityAfter(entity1, P2, P3)
    const entity3: Entity = buildEntityAfter(entity2, P3, P4)


    let storage: PointerStorage
    let manager: PointerManager

    beforeEach(async () => {
        storage = new PointerStorage(new MockedStorage())
        manager = new PointerManager(storage)
    })

    it(`When a pointer manager is queried, the cache uses the storage correctly`, async () => {
        storage = new PointerStorage(new MockedStorage())
        const manager1 = new PointerManager(storage)

        await manager1.tryToCommitPointers(entity1)

        const manager2 = new PointerManager(storage)

        expect(await manager2.getEntityInPointer(type, P1)).toEqual(entity1.id)
        expect(await manager2.getEntityInPointer(type, P2)).toEqual(entity1.id)
    });

    it(`When an entity is commited and there are no pointers assigned, it can be commited, `, async () => {
        await assertCommitResult(entity1, true)

        await assertEntityIsReferencedByPointers(entity1, P1, P2)
    });

    it(`When deployment events are e1,e2 then the results are the expected`, async () => {
        await manager.tryToCommitPointers(entity1)

        await assertCommitResult(entity2, true, entity1)

        await assertPointersAreInactive(P1)
        await assertEntityIsReferencedByPointers(entity2, P2, P3)
    });

    it(`When deployment events are e1,e3,e2 then the results are the expected`, async () => {
        await manager.tryToCommitPointers(entity1);

        await assertCommitResult(entity3, true)
        await assertCommitResult(entity2, false, entity1)

        await assertPointersAreInactive(P1, P2)
        await assertEntityIsReferencedByPointers(entity3, P3, P4)
    });

    it(`When deployment events are e2,e3,e1 then the results are the expected`, async () => {
        await manager.tryToCommitPointers(entity2);

        await assertCommitResult(entity3, true, entity2)
        await assertCommitResult(entity1, false)

        await  assertPointersAreInactive(P1, P2)
        await  assertEntityIsReferencedByPointers(entity3, P3, P4)
    });

    it(`When deployment events are e3,e2,e1 then the results are the expected`, async () => {
        await manager.tryToCommitPointers(entity3)

        await assertCommitResult(entity2, false)
        await assertCommitResult(entity1, false)

        await assertPointersAreInactive(P1, P2)
        await assertEntityIsReferencedByPointers(entity3, P3, P4)
    });

    it(`When deployment events are e3,e1,e2 then the results are the expected`, async () => {
        await manager.tryToCommitPointers(entity3)

        await assertCommitResult(entity1, true)
        await assertCommitResult(entity2, false, entity1)

        await assertPointersAreInactive(P1, P2)
        await assertEntityIsReferencedByPointers(entity3, P3, P4)
    });

    async function assertPointersAreInactive(...pointers: Pointer[]) {
        for (const pointer of pointers) {
            expect(await manager.getEntityInPointer(type, pointer)).toEqual(undefined)
        }
    }

    async function assertEntityIsReferencedByPointers(entity: Entity, ...pointers: Pointer[]) {
        for (const pointer of pointers) {
            expect(await manager.getEntityInPointer(type, pointer)).toEqual(entity.id)
        }
    }

    async function assertCommitResult(entity: Entity, expectedCouldCommit: boolean, ...expectedEntitiesToDelete: Entity[]) {
        const commitResult: CommitResult = await manager.tryToCommitPointers(entity);
        expect(commitResult.couldCommit).toEqual(expectedCouldCommit)
        expect(commitResult.entitiesDeleted).toEqual(expectedEntitiesToDelete.map(entity => entity.id))
    }

    function buildEntity(...pointers: Pointer[]): Entity {
        return new Entity(random.alphaNumeric(10), type, pointers, random.number())
    }

    function buildEntityAfter(entity: Entity, ...pointers: Pointer[]): Entity {
        return new Entity(random.alphaNumeric(10), type, pointers, entity.timestamp + 1)
    }

})
