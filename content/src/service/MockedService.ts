import { Service, Entity, EntityType, Pointer } from "./service"

export class MockedService extends Service {

    getEntitiesByIds(type: EntityType, ids: Pointer[]): Promise<Entity[]> {
        return Promise.resolve(entities)
    }

    getEntitiesByPointers(type: EntityType, ids: Pointer[]): Promise<Entity[]> {
        return Promise.resolve(entities)
    }

}

const entities: Entity[] = [
    createScene("1", [], "some-metadata-1"),
    createScene("2", [], "some-metadata-2"),
]

function createScene(id: string, pointers: Pointer[], metadata: string): Entity {
    return {
        id: id,
        type: EntityType.SCENE,
        content: new Map<string,string>(),
        metadata: metadata,
        pointers: pointers,
        timestamp: Date.now()
    }
}
