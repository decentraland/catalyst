import { Service, EthAddress, Signature, Timestamp, File } from "./Service"
import { EntityType, Pointer, EntityId, Entity } from "./Entity"

export class MockedService extends Service {

    getEntitiesByIds(type: EntityType, ids: Pointer[]): Promise<Entity[]> {
        return Promise.resolve(entities)
    }

    getEntitiesByPointers(type: EntityType, ids: Pointer[]): Promise<Entity[]> {
        return Promise.resolve(entities)
    }

    deployEntity(files: Set<File>, entityId: EntityId, ethAddress: EthAddress, signature: Signature): Promise<Timestamp> {
        console.log("MockedService.deployEntity")
        console.log(files)
        console.log(entityId)
        console.log(ethAddress)
        console.log(signature)
        let contentsMap = new Map<string, string>()
        files.forEach(f => contentsMap.set(f.name, "lenght: " + f.content.length))
        entities.push(scene(
            entityId,
            JSON.stringify({
                entityId: entityId,
                ethAddress: ethAddress,
                signature: signature
            }),
            pointers(),
            contentsMap
        ))
        return Promise.resolve(Date.now())
    }

}

const entities: Entity[] = [
    scene("1", "some-metadata-1", pointers("A", "B"), contents("A1", "1", "A2", "2")),
    scene("2", "some-metadata-2", pointers("C", "D"), contents("B1", "1", "B2", "2")),
]

function scene(id: string, metadata: string, pointers: Set<Pointer>, contents: Map<string,string>): Entity {
    return {
        id: id,
        type: EntityType.SCENE,
        timestamp: Date.now(),
        metadata: metadata,
        pointers: pointers,
        content: contents,
    }
}

function pointers(...pointers: string[]): Set<string> {
    return new Set(pointers)
}

function contents(...contents: string[]): Map<string,string> {
    let contentsMap = new Map<string, string>()
    for(var i=0; i<contents.length; i+=2) {
        contentsMap.set(contents[i], contents[i+1])
    }
    return contentsMap
}
