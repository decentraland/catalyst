import { random } from "faker"
import { ServerStatus, DeploymentFilters, PartialDeploymentHistory, EntityType, EntityId, ContentFile, Timestamp, Pointer, ContentFileHash, LegacyPartialDeploymentHistory, AuditInfo, LegacyAuditInfo } from "dcl-catalyst-commons"
import { MetaverseContentService, LocalDeploymentAuditInfo } from "@katalyst/content/service/Service"
import { Entity } from "@katalyst/content/service/Entity"
import { buildEntityAndFile } from "./EntityTestFactory"
import { CURRENT_CONTENT_VERSION } from "@katalyst/content/Environment"
import { AuthLinkType } from "dcl-crypto"
import { ContentItem, SimpleContentItem } from "@katalyst/content/storage/ContentStorage"
import { RepositoryTask, Repository } from "@katalyst/content/storage/Repository"
import { Deployment, PointerChangesFilters, DeploymentPointerChanges } from "@katalyst/content/service/deployments/DeploymentManager"
import { FailedDeployment } from "@katalyst/content/service/errors/FailedDeploymentsManager"

export class MockedMetaverseContentService implements MetaverseContentService {

    static readonly STATUS: ServerStatus = {
        name: "name",
        version: "4.20",
        currentTime: Date.now(),
        lastImmutableTime: 0,
        historySize: 0,
    }

    static readonly AUDIT_INFO: AuditInfo & LegacyAuditInfo = {
        localTimestamp: Date.now(),
        originTimestamp: Date.now(),
        deployedTimestamp: Date.now(),
        originServerUrl: 'http://localhost',
        authChain: [{type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY, signature:random.alphaNumeric(10), payload:random.alphaNumeric(10)}],
        version: CURRENT_CONTENT_VERSION,
    }

    private readonly entities: Entity[]
    private readonly content: Map<ContentFileHash, Buffer>
    private readonly pointerChanges: DeploymentPointerChanges[]

    constructor(builder: MockedMetaverseContentServiceBuilder) {
        this.entities = builder.entities
        this.content = builder.content
        this.pointerChanges = builder.pointerChanges
    }

    deleteContent(fileHashes: string[]): Promise<void> {
        throw new Error("Method not implemented.")
    }

    getPointerChanges(filters?: PointerChangesFilters, offset?: number, limit?: number, repository?: RepositoryTask | Repository) {
        return Promise.resolve({
            pointerChanges: this.pointerChanges,
            filters: {},
            pagination: {
                offset: 0,
                limit: 100,
                moreData: false,
            }
        })
    }

    getDeployments(filters?: DeploymentFilters, offset?: number, limit?: number): Promise<PartialDeploymentHistory<Deployment>> {
        return Promise.resolve({
            deployments: this.entities.map(entity => this.entityToDeployment(entity)).filter(deployment => !filters?.entityIds || filters.entityIds.includes(deployment.entityId)),
            filters: { },
            pagination: {
                offset: 0,
                limit: 100,
                moreData: false,
            }
        })
    }

    deployEntity(files: ContentFile[], entityId: EntityId, auditInfo: LocalDeploymentAuditInfo): Promise<Timestamp> {
        return Promise.resolve(Date.now())
    }

    deployToFix(files: ContentFile[], entityId: EntityId): Promise<Timestamp> {
        return Promise.resolve(Date.now())
    }

    deployLocalLegacy(files: ContentFile[], entityId: string, auditInfo: LocalDeploymentAuditInfo, repository?: RepositoryTask | Repository): Promise<number> {
        throw new Error("Method not implemented.")
    }

    isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>> {
        const entries: [ContentFileHash, boolean][] = fileHashes.map(fileHash => [fileHash, this.content.has(fileHash) || this.isThereAnEntityWithId(fileHash)])
        return Promise.resolve(new Map(entries))
    }

    getContent(fileHash: string): Promise<ContentItem> {
        const buffer = this.content.get(fileHash)
        if (!buffer) {
            if (this.isThereAnEntityWithId(fileHash)) {
                // Returning the buffer with the id, since we don't have the actual file content
                return Promise.resolve(SimpleContentItem.fromBuffer(Buffer.from(fileHash)))
            }
            throw new Error(`Failed to find content with hash ${fileHash}`);
        } else {
            return Promise.resolve(SimpleContentItem.fromBuffer(buffer))
        }
    }

    getStatus(): ServerStatus {
        return MockedMetaverseContentService.STATUS
    }

    getLegacyHistory(from?: number, to?: number, serverName?: string, offset?: number, limit?: number): Promise<LegacyPartialDeploymentHistory> {
        throw new Error("Method not implemented.")
    }

    getAllFailedDeployments(): Promise<FailedDeployment[]> {
        throw new Error("Method not implemented.")
    }

    private entityToDeployment(entity: Entity): Deployment {
        return {
            ...entity,
            entityType: entity.type,
            entityId: entity.id,
            entityTimestamp: entity.timestamp,
            deployedBy: '',
            auditInfo: MockedMetaverseContentService.AUDIT_INFO,
        }
    }

    private isThereAnEntityWithId(entityId: EntityId): boolean {
        return this.entities.map(entity => entity.id == entityId)
            .reduce((accum,  currentValue) => accum || currentValue)
    }

}

export class MockedMetaverseContentServiceBuilder {

    readonly entities: Entity[] = []
    readonly content: Map<ContentFileHash, Buffer> = new Map()
    readonly pointerChanges: DeploymentPointerChanges[] = []

    withEntity(newEntity: Entity): MockedMetaverseContentServiceBuilder {
        this.entities.push(newEntity)
        return this
    }

    withContent(...content: { hash: ContentFileHash, buffer: Buffer }[]): MockedMetaverseContentServiceBuilder {
        content.forEach(({hash, buffer}) => this.content.set(hash, buffer))
        return this
    }

    withPointerChanges(delta: DeploymentPointerChanges): MockedMetaverseContentServiceBuilder {
        this.pointerChanges.push(delta)
        return this
    }

    build(): MockedMetaverseContentService {
        return new MockedMetaverseContentService(this)
    }

}

export function buildEntity(pointers: Pointer[], ...content: { hash: ContentFileHash, buffer: Buffer }[]): Promise<[Entity, ContentFile]>  {
    const entityContent: Map<string, ContentFileHash> = new Map(content.map(aContent => [random.alphaNumeric(10), aContent.hash]))
    return buildEntityAndFile(EntityType.PROFILE, pointers, random.number({min:5, max:10}), entityContent, random.alphaNumeric(10))
}

export function buildContent(): { hash: ContentFileHash, buffer: Buffer } {
    return {
        hash: random.alphaNumeric(10),
        buffer: Buffer.from(random.alphaNumeric(10))
    }
}


