import { AuthChain, AuthLinkType } from '@dcl/crypto'
import { DeploymentWithAuthChain, Entity, EntityType } from '@dcl/schemas'
import {
  AuditInfo,
  Deployment,
  EntityVersion,
  PartialDeploymentHistory
} from 'dcl-catalyst-commons'
import { random } from 'faker'
import { CURRENT_CONTENT_VERSION } from '../../../src/Environment'
import { ContentItem, SimpleContentItem } from '../../../src/ports/contentStorage/contentStorage'
import { FailedDeployment } from '../../../src/ports/failedDeploymentsCache'
import { DeploymentOptions, PointerChangesOptions } from '../../../src/service/deployments/types'
import { DeploymentContext, LocalDeploymentAuditInfo, MetaverseContentService } from '../../../src/service/Service'
import { IStatusCapableComponent, StatusProbeResult } from '../../../src/types'
import { buildEntityAndFile } from './EntityTestFactory'

export class MockedMetaverseContentService implements MetaverseContentService, IStatusCapableComponent {
  static readonly STATUS = {
    name: 'name',
    version: EntityVersion.V3,
    currentTime: Date.now(),
    lastImmutableTime: 0,
    snapshot: {
      entities: {},
      lastUpdated: Date.now()
    }
  }

  static readonly AUDIT_INFO: AuditInfo = {
    localTimestamp: Date.now(),
    authChain: [
      {
        type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY as AuthLinkType,
        signature: random.alphaNumeric(10),
        payload: random.alphaNumeric(10)
      }
    ],
    version: CURRENT_CONTENT_VERSION as EntityVersion
  }

  private readonly entities: Entity[]
  private readonly content: Map<string, Buffer>
  private readonly pointerChanges: DeploymentWithAuthChain[]

  constructor(builder: MockedMetaverseContentServiceBuilder) {
    this.entities = builder.entities
    this.content = builder.content
    this.pointerChanges = builder.pointerChanges
  }
  async getComponentStatus(): Promise<StatusProbeResult> {
    return {
      name: 'mockedContentService',
      data: MockedMetaverseContentService.STATUS
    }
  }
  reportErrorDuringSync(
    entityType: EntityType,
    entityId: string,
    reason: string,
    authChain: AuthChain,
    errorDescription?: string
  ): Promise<null> {
    throw new Error('Method not implemented.')
  }

  getEntityById(entityId: string): Promise<{ entityId: string; localTimestamp: number } | void> {
    throw new Error('Method not implemented.')
  }

  async deployEntityFromRemoteServer() {
    // noop
  }

  getPointerChanges(options?: PointerChangesOptions) {
    return Promise.resolve({
      pointerChanges: this.pointerChanges,
      filters: {},
      pagination: {
        offset: 0,
        limit: 100,
        moreData: false
      }
    })
  }

  getDeployments(options?: DeploymentOptions): Promise<PartialDeploymentHistory<Deployment>> {
    return Promise.resolve({
      deployments: this.entities
        .map((entity) => this.entityToDeployment(entity))
        .filter(
          (deployment) => !options?.filters?.entityIds || options.filters.entityIds.includes(deployment.entityId)
        ),
      filters: {},
      pagination: {
        offset: 0,
        limit: 100,
        moreData: false
      }
    })
  }

  deployEntity(
    files: Buffer[],
    entityId: string,
    auditInfo: LocalDeploymentAuditInfo,
    context: DeploymentContext
  ): Promise<number> {
    return Promise.resolve(Date.now())
  }

  isContentAvailable(fileHashes: string[]): Promise<Map<string, boolean>> {
    const entries: [string, boolean][] = fileHashes.map((fileHash) => [
      fileHash,
      this.content.has(fileHash) || this.isThereAnEntityWithId(fileHash)
    ])
    return Promise.resolve(new Map(entries))
  }

  getContent(fileHash: string): Promise<ContentItem> {
    const buffer = this.content.get(fileHash)
    if (!buffer) {
      if (this.isThereAnEntityWithId(fileHash)) {
        // Returning the buffer with the id, since we don't have the actual file content
        return Promise.resolve(SimpleContentItem.fromBuffer(Buffer.from(fileHash)))
      }
      throw new Error(`Failed to find content with hash ${fileHash}`)
    } else {
      return Promise.resolve(SimpleContentItem.fromBuffer(buffer))
    }
  }

  getAllFailedDeployments(): FailedDeployment[] {
    throw new Error('Method not implemented.')
  }

  getEntitiesByIds(ids: string[]): Promise<Entity[]> {
    return Promise.resolve(this.entities.filter(({ id }) => ids.includes(id)))
  }

  getEntitiesByPointers(pointers: string[]): Promise<Entity[]> {
    return Promise.resolve(
      this.entities.filter((entity) => entity.pointers.some((pointer) => pointers.includes(pointer)))
    )
  }

  private entityToDeployment(entity: Entity): Deployment {
    return {
      ...entity,
      entityVersion: EntityVersion.V3,
      entityType: entity.type,
      entityId: entity.id,
      entityTimestamp: entity.timestamp,
      deployedBy: '',
      auditInfo: MockedMetaverseContentService.AUDIT_INFO,
      content: entity.content?.map(({ file, hash }) => ({ key: file, hash })) ?? []
    }
  }

  private isThereAnEntityWithId(entityId: string): boolean {
    return this.entities.map((entity) => entity.id == entityId).reduce((accum, currentValue) => accum || currentValue)
  }
}

export class MockedMetaverseContentServiceBuilder {
  readonly entities: Entity[] = []
  readonly content: Map<string, Buffer> = new Map()
  readonly pointerChanges: DeploymentWithAuthChain[] = []

  withEntity(newEntity: Entity): MockedMetaverseContentServiceBuilder {
    this.entities.push(newEntity)
    return this
  }

  withContent(...content: { hash: string; buffer: Buffer }[]): MockedMetaverseContentServiceBuilder {
    content.forEach(({ hash, buffer }) => this.content.set(hash, buffer))
    return this
  }

  withPointerChanges(delta: DeploymentWithAuthChain): MockedMetaverseContentServiceBuilder {
    this.pointerChanges.push(delta)
    return this
  }

  build(): MockedMetaverseContentService {
    return new MockedMetaverseContentService(this)
  }
}

export function buildEntity(
  pointers: string[],
  ...content: { hash: string; buffer: Buffer }[]
): Promise<[Entity, Uint8Array]> {
  const entityContent: Map<string, string> = new Map(
    content.map((aContent) => [random.alphaNumeric(10), aContent.hash])
  )
  return buildEntityAndFile(
    EntityType.PROFILE,
    pointers,
    random.number({ min: 5, max: 10 }),
    entityContent,
    { metadata: random.alphaNumeric(10) }
  )
}

export function buildContent(): { hash: string; buffer: Buffer } {
  return {
    hash: random.alphaNumeric(10),
    buffer: Buffer.from(random.alphaNumeric(10))
  }
}
