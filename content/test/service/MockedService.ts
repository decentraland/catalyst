import { Service, EthAddress, Signature, Timestamp, File } from "../../src/service/Service"
import { EntityType, Pointer, EntityId, Entity } from "../../src/service/Entity"

export class MockedService implements Service {

    private entities: Entity[] = [
        this.scene("1", "some-metadata-1", this.pointers("A", "B"), this.contents("A1", "1", "A2", "2")),
        this.scene("2", "some-metadata-2", this.pointers("C", "D"), this.contents("B1", "1", "B2", "2")),
    ]
    
    getEntitiesByIds(type: EntityType, ids: Pointer[]): Promise<Entity[]> {
        return Promise.resolve(this.entities)
    }

    getEntitiesByPointers(type: EntityType, ids: Pointer[]): Promise<Entity[]> {
        return Promise.resolve(this.entities)
    }

    deployEntity(files: Set<File>, entityId: EntityId, ethAddress: EthAddress, signature: Signature): Promise<Timestamp> {
        console.log("MockedService.deployEntity")
        console.log(files)
        console.log(entityId)
        console.log(ethAddress)
        console.log(signature)
        let contentsMap = new Map<string, string>()
        files.forEach(f => contentsMap.set(f.name, "lenght: " + f.content.length))
        this.entities.push(this.scene(
            entityId,
            JSON.stringify({
                entityId: entityId,
                ethAddress: ethAddress,
                signature: signature
            }),
            this.pointers(),
            contentsMap
        ))
        return Promise.resolve(Date.now())
    }

    getActivePointers(type: EntityType): Promise<string[]> {
        throw new Error("Method not implemented.")
    }
    getAuditInfo(type: EntityType, id: string): Promise<import("../../src/service/Service").AuditInfo> {
        throw new Error("Method not implemented.")
    }
    getHistory(from?: number | undefined, to?: number | undefined, type?: import("../../src/service/Service").HistoryType | undefined): Promise<import("../../src/service/Service").HistoryEvent[]> {
        throw new Error("Method not implemented.")
    }
    isContentAvailable(fileHashes: string[]): Promise<Map<string, Boolean>> {
        throw new Error("Method not implemented.")
    }

    private scene(id: string, metadata: string, pointers: Set<Pointer>, contents: Map<string,string>): Entity {
        return {
            id: id,
            type: EntityType.SCENE,
            timestamp: Date.now(),
            metadata: metadata,
            pointers: pointers,
            content: contents,
        }
    }
    
    private pointers(...pointers: string[]): Set<string> {
        return new Set(pointers)
    }
    
    private contents(...contents: string[]): Map<string,string> {
        let contentsMap = new Map<string, string>()
        for(var i=0; i<contents.length; i+=2) {
            contentsMap.set(contents[i], contents[i+1])
        }
        return contentsMap
    }
    
}
