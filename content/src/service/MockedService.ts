import { Service} from "./Service"
import { EntityType, Pointer, Entity } from "./Entity"

export class MockedService extends Service {

    getEntitiesByIds(type: EntityType, ids: Pointer[]): Promise<Entity[]> {
        return Promise.resolve(entities)
    }

    getEntitiesByPointers(type: EntityType, ids: Pointer[]): Promise<Entity[]> {
        return Promise.resolve(entities)
    }

}

const entities: Entity[] = [
    createScene("1", new Set(), "some-metadata-1"),
    createScene("2", new Set(), "some-metadata-2"),
]

function createScene(id: string, pointers: Set<Pointer>, metadata: string): Entity {
    return {
        id: id,
        type: EntityType.SCENE,
        content: new Map<string,string>(),
        metadata: metadata,
        pointers: pointers,
        timestamp: Date.now()
    }
}
