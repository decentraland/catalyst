import { random } from "faker"
import { MetaverseContentService, Timestamp, File, ServerStatus } from "../../src/service/Service"
import { EntityType, Pointer, EntityId, Entity } from "../../src/service/Entity"
import { FileHash } from "../../src/service/Hashing"
import { AuditInfo } from "../../src/service/audit/Audit"
import { EthAddress, Signature } from "../../src/service/auth/Authenticator"
import { buildEntityAndFile } from "./EntityTestFactory"

export class MockedMetaverseContentService implements MetaverseContentService {

    static readonly STATUS: ServerStatus = {
        name: "name",
        version: "4.20",
        currentTime: Date.now(),
        lastImmutableTime: 0
    }

    static readonly AUDIT_INFO: AuditInfo = {
        deployedTimestamp: Date.now(),
        ethAddress: random.alphaNumeric(10),
        signature: random.alphaNumeric(10),
    }

    private readonly entities: Entity[]
    private readonly content: Map<FileHash, Buffer>

    constructor(builder: MockedMetaverseContentServiceBuilder) {
        this.entities = builder.entities
        this.content = builder.content
    }

    getEntitiesByPointers(type: EntityType, pointers: string[]): Promise<Entity[]> {
        return Promise.resolve(this.entities.filter(entity => entity.type == type && this.intersects(pointers, entity.pointers)))
    }

    getEntitiesByIds(type: EntityType, ids: EntityId[]): Promise<Entity[]> {
        return Promise.resolve(this.entities.filter(entity => entity.type == type && ids.includes(entity.id)))
    }

    getActivePointers(type: EntityType): Promise<Pointer[]> {
        const pointers = this.entities.filter(entity => entity.type == type)
            .map(entity => entity.pointers)
            .reduce((accum, current) => accum.concat(current), [])
        return Promise.resolve(pointers)
    }

    deployEntity(files: File[], entityId: EntityId, ethAddress: EthAddress, signature: Signature): Promise<Timestamp> {
        return Promise.resolve(Date.now())
    }

    isContentAvailable(fileHashes: FileHash[]): Promise<Map<FileHash, boolean>> {
        const entries: [FileHash, boolean][] = fileHashes.map(fileHash => [fileHash, this.content.has(fileHash) || this.isThereAnEntityWithId(fileHash)])
        return Promise.resolve(new Map(entries))
    }

    getContent(fileHash: string): Promise<Buffer> {
        const buffer = this.content.get(fileHash)
        if (!buffer) {
            if (this.isThereAnEntityWithId(fileHash)) {
                // Returning the buffer with the id, since we don't have the actual file content
                return Promise.resolve(Buffer.from(fileHash))
            }
            throw new Error(`Failed to find content with hash ${fileHash}`);
        } else {
            return Promise.resolve(buffer)
        }
    }

    getStatus(): Promise<ServerStatus> {
        return Promise.resolve(MockedMetaverseContentService.STATUS)
    }

    getAuditInfo(type: EntityType, id: EntityId): Promise<AuditInfo> {
        return Promise.resolve(MockedMetaverseContentService.AUDIT_INFO)
    }

    private isThereAnEntityWithId(entityId: EntityId): boolean {
        return this.entities.map(entity => entity.id == entityId)
            .reduce((accum,  currentValue) => accum || currentValue)
    }

    private intersects(pointers1: Pointer[], pointers2: Pointer[]) {
        for (const pointer of pointers1) {
            if (pointers2.includes(pointer)) {
                return true
            }
        }
        return false
    }

}

export class MockedMetaverseContentServiceBuilder {

    readonly entities: Entity[] = []
    readonly content: Map<FileHash, Buffer> = new Map()

    withEntity(newEntity: Entity): MockedMetaverseContentServiceBuilder {
        this.entities.push(newEntity)
        return this
    }

    withContent(...content: { hash: FileHash, buffer: Buffer }[]): MockedMetaverseContentServiceBuilder {
        content.forEach(({hash, buffer}) => this.content.set(hash, buffer))
        return this
    }

    build(): MockedMetaverseContentService {
        return new MockedMetaverseContentService(this)
    }

}

export function buildEntity(pointers: Pointer[], ...content: { hash: FileHash, buffer: Buffer }[]): Promise<[Entity, File]>  {
    const entityContent: Map<string, FileHash> = new Map(content.map(aContent => [random.alphaNumeric(10), aContent.hash]))
    return buildEntityAndFile(EntityType.PROFILE, pointers, random.number(10), entityContent, random.alphaNumeric(10))
}

export function buildContent(): { hash: FileHash, buffer: Buffer } {
    return {
        hash: random.alphaNumeric(10),
        buffer: Buffer.from(random.alphaNumeric(10))
    }
}


