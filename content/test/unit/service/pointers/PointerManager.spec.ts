// import { random } from "faker"
// import { EntityType, Entity, Pointer, EntityId } from "@katalyst/content/service/Entity";
// import { PointerManager, PointerReference } from "@katalyst/content/service/pointers/PointerManager";
// import { PointerStorage } from "@katalyst/content/service/pointers/PointerStorage";
// import { MockedStorage } from "../../storage/MockedStorage";
// import { CacheManager } from "@katalyst/content/service/caching/CacheManager";

// describe("PointerManager", () => {

//     const P1 = "X1,Y1"
//     const P2 = "X2,Y2"
//     const P3 = "X3,Y3"
//     const P4 = "X4,Y4"
//     const type = EntityType.PROFILE
//     const entity1: Entity = buildEntity(P1)
//     const entity2: Entity = buildEntityAfter(entity1, P2)
//     const entity3: Entity = buildEntityAfter(entity2, P1, P2, P3)
//     const entity4: Entity = buildEntityAfter(entity3, P1, P3, P4)
//     const entity5: Entity = buildEntityAfter(entity4, P2, P4)

//     const allEntities = [addName("E1", entity1),
//         addName("E2", entity2),
//         addName("E3", entity3),
//         addName("E4", entity4),
//         addName("E5", entity5)]

//     function addName(name: string, entity: Entity) {
//         return { name, entity }
//     }

//     let audit
//     let storage: PointerStorage
//     let manager: PointerManager

//     beforeEach(() => {
//         storage = new PointerStorage(new MockedStorage())
//         audit = buildAudit()
//         manager = new PointerManager(storage, audit, new CacheManager())
//     })

//     permutator(allEntities)
//         .forEach(function(testParams) {
//             const names = testParams.map(({ name }) => name).join(' -> ')
//             it(names, async function(done) {
//                 const entities = testParams.map(({ entity }) => entity)
//                 await commit(entities);
//                 await assertCommitsWhereDoneCorrectly()
//                 done();
//             });
//     });

//     async function assertCommitsWhereDoneCorrectly() {
//         // Make sure that pointers' history was stored correctly
//         const p1References = await storage.getPointerReferences(type, P1);
//         expect(p1References).toEqual([ref(entity1), ref(entity3), ref(entity4), delRef(entity5)])

//         const p2References = await storage.getPointerReferences(type, P2);
//         expect(p2References).toEqual([ref(entity2), ref(entity3), delRef(entity4), ref(entity5)])

//         const p3References = await storage.getPointerReferences(type, P3);
//         expect(p3References).toEqual([ref(entity3), ref(entity4), delRef(entity5)])

//         const p4References = await storage.getPointerReferences(type, P4);
//         expect(p4References).toEqual([ref(entity4), ref(entity5)])

//         // Make sure that overwrites were set correctly
//         const expectedOverwrites: Map<EntityId, EntityId> = new Map()
//         expectedOverwrites.set(entity1.id, entity3.id)
//         expectedOverwrites.set(entity2.id, entity3.id)
//         expectedOverwrites.set(entity3.id, entity4.id)
//         expectedOverwrites.set(entity4.id, entity5.id)

//         expect(audit.getOverwrites()).toEqual(expectedOverwrites)

//         // Make sure that the pointers reference the correct entities
//         expect(await manager.getEntityInPointer(type, P1)).toBeUndefined()
//         expect(await manager.getEntityInPointer(type, P2)).toEqual(entity5.id)
//         expect(await manager.getEntityInPointer(type, P3)).toBeUndefined()
//         expect(await manager.getEntityInPointer(type, P4)).toEqual(entity5.id)
//     }

//     function delRef(entity: Entity) {
//         return {
//             timestamp: entity.timestamp,
//             entityId: PointerManager.DELETED
//         }
//     }

//     function ref(entity: Entity): PointerReference {
//         return {
//             timestamp: entity.timestamp,
//             entityId: entity.id
//         }
//     }

//     function buildEntity(...pointers: Pointer[]): Entity {
//         return new Entity(random.alphaNumeric(10), type, pointers, random.number())
//     }

//     function buildEntityAfter(entity: Entity, ...pointers: Pointer[]): Entity {
//         return new Entity(random.alphaNumeric(10), type, pointers, entity.timestamp + 1)
//     }

//     function buildAudit() {
//         const overwrites: Map<EntityId, EntityId> = new Map()
//         return {
//             setEntityAsOverwritten: (id: EntityId, overwrittenBy: EntityId) => { overwrites.set(id, overwrittenBy); return Promise.resolve() },
//             getOverwrites: () => overwrites
//         }
//     }

//     async function commit(entities: Entity[]) {
//         const fetcher = (entityId: EntityId) => {
//             return Promise.resolve([entity1, entity2, entity3, entity4, entity5].find(entity => entity.id == entityId))
//         }
//         for (const entity of entities) {
//             await manager.referenceEntityFromPointers(entity, fetcher);
//         }
//     }

//     function permutator<T>(array: Array<T>): Array<Array<T>> {
//         let result: Array<Array<T>> = [];

//         const permute = (arr:  Array<T>, m:  Array<T> = []) => {
//             if (arr.length === 0) {
//                 result.push(m)
//             } else {
//                 for (let i = 0; i < arr.length; i++) {
//                     let curr = arr.slice();
//                     let next = curr.splice(i, 1);
//                     permute(curr.slice(), m.concat(next))
//                 }
//             }
//         }
//         permute(array)
//         return result;
//     }

// })