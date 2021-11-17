import {
  ContentFileHash,
  EntityId,
  EntityType,
  PartialDeploymentHistory,
  Pointer,
  ServerStatus
} from 'dcl-catalyst-commons'
import { DenylistRepository } from '../repository/extensions/DenylistRepository'
import { Repository } from '../repository/Repository'
import { DB_REQUEST_PRIORITY } from '../repository/RepositoryQueue'
import { ContentAuthenticator } from '../service/auth/Authenticator'
import { Deployment, DeploymentOptions, PointerChangesFilters } from '../service/deployments/DeploymentManager'
import { Entity } from '../service/Entity'
import { EntityFactory } from '../service/EntityFactory'
import {
  DeploymentContext,
  DeploymentFiles,
  DeploymentListener,
  DeploymentResult,
  LocalDeploymentAuditInfo,
  MetaverseContentService
} from '../service/Service'
import { ServiceImpl } from '../service/ServiceImpl'
import { ContentItem } from '../storage/ContentStorage'
import { Denylist } from './Denylist'
import {
  buildAddressTarget,
  buildContentTarget,
  buildEntityTarget,
  buildPointerTarget,
  DenylistTarget,
  DenylistTargetId,
  DenylistTargetType
} from './DenylistTarget'

/**
 * This decorator takes a MetaverseContentService and adds denylisting functionality to it
 */
export class DenylistServiceDecorator implements MetaverseContentService {
  static DENYLISTED_METADATA: string = 'Denylisted'

  constructor(
    private readonly service: MetaverseContentService,
    private readonly denylist: Denylist,
    private readonly repository: Repository
  ) {}

  start(): Promise<void> {
    return this.service.start()
  }

  async getContent(fileHash: ContentFileHash): Promise<ContentItem | undefined> {
    const isDenylisted = await this.repository.run(
      (db) => this.areDenylisted(db.denylist, ...this.getHashTargets(fileHash)),
      {
        priority: DB_REQUEST_PRIORITY.HIGH
      }
    )
    if (isDenylisted) {
      return undefined
    } else {
      return this.service.getContent(fileHash)
    }
  }

  /** If content is denylisted, then we will return that it is not available */
  async isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<string, boolean>> {
    const availability: Map<ContentFileHash, boolean> = await this.service.isContentAvailable(fileHashes)
    const onlyAvailable: ContentFileHash[] = Array.from(availability.entries())
      .filter(([, available]) => available)
      .map(([hash]) => hash)
    const hashToTargets = new Map(onlyAvailable.map((hash) => [hash, this.getHashTargets(hash)]))
    const allTargets = Array.from(hashToTargets.values()).reduce((curr, next) => curr.concat(next), [])
    const result = await this.repository.run((db) => this.denylist.areTargetsDenylisted(db.denylist, allTargets), {
      priority: DB_REQUEST_PRIORITY.HIGH
    })

    for (const [fileHash, targets] of hashToTargets) {
      const isDenylisted = targets.some((target) => isTargetDenylisted(target, result))
      if (isDenylisted) {
        availability.set(fileHash, false)
      }
    }

    return availability
  }

  async deployEntity(
    files: DeploymentFiles,
    entityId: EntityId,
    auditInfo: LocalDeploymentAuditInfo,
    context: DeploymentContext = DeploymentContext.LOCAL
  ): Promise<DeploymentResult> {
    return this.repository.task(
      async (task) => {
        // Validate the deployment
        const hashedFiles = await this.validateDeployment(task.denylist, files, entityId, auditInfo)

        // If all validations passed, then deploy the entity
        return this.service.deployEntity(hashedFiles, entityId, auditInfo, context, task)
      },
      { priority: DB_REQUEST_PRIORITY.HIGH }
    )
  }

  deleteContent(fileHashes: string[]): Promise<void> {
    return this.service.deleteContent(fileHashes)
  }

  async getDeployments(options?: DeploymentOptions): Promise<PartialDeploymentHistory<Deployment>> {
    return this.repository.task(
      async (task) => {
        const deploymentHistory = await this.service.getDeployments(options, task)

        // Prepare holders
        const entityTargetsByEntity: Map<EntityId, DenylistTarget> = new Map()
        const contentTargetsByEntity: Map<EntityId, Map<ContentFileHash, DenylistTarget>> = new Map()
        const pointerTargetsByEntity: Map<EntityId, Map<Pointer, DenylistTarget>> = new Map()
        const allTargets: DenylistTarget[] = []

        // Calculate and group targets by entity
        deploymentHistory.deployments.forEach(({ entityId, entityType, content, pointers }) => {
          const entityTarget = buildEntityTarget(entityType, entityId)
          const hashTargets: Map<ContentFileHash, DenylistTarget> = !content
            ? new Map()
            : new Map(Array.from(content.entries()).map(([, hash]) => [hash, buildContentTarget(hash)]))
          const pointerTargets: Map<Pointer, DenylistTarget> = new Map(
            pointers.map((pointer) => [pointer, buildPointerTarget(entityType, pointer)])
          )
          entityTargetsByEntity.set(entityId, entityTarget)
          contentTargetsByEntity.set(entityId, hashTargets)
          pointerTargetsByEntity.set(entityId, pointerTargets)
          allTargets.push(entityTarget, ...hashTargets.values(), ...pointerTargets.values())
        })

        // Check which targets are denylisted only if there items in denylist
        const queryResult = await this.denylist.areTargetsDenylisted(task.denylist, allTargets)

        // Filter out deployments with denylisted pointers
        const filteredDeployments = deploymentHistory.deployments.filter(({ entityId, pointers }) => {
          if (options?.filters?.pointers && options.filters.pointers.length > 0) {
            // Calculate the intersection between the pointers used to filter, and the deployment's pointers. Consider that the intersection can't be empty
            const intersection = options.filters.pointers.filter((pointer) => pointers.includes(pointer))
            const pointerTargets: Map<Pointer, DenylistTarget> = pointerTargetsByEntity.get(entityId)!
            // Check if there is at least one pointer on the intersection that is not denylisted
            const isAtLeastOnePointerNotDenylisted = intersection
              .map((pointer) => pointerTargets.get(pointer)!)
              .some((target) => !isTargetDenylisted(target, queryResult))
            // If there is one pointer on the intersection that is not denylisted, then the entity shouldn't be filtered out
            return isAtLeastOnePointerNotDenylisted
          }
          return true
        })

        // Perform sanitization
        const sanitizedDeployments = filteredDeployments.map((deployment) => {
          const { entityId } = deployment
          const entityTarget = entityTargetsByEntity.get(entityId)!
          const contentTargets = contentTargetsByEntity.get(entityId)!

          const isEntityDenylisted = isTargetDenylisted(entityTarget, queryResult)
          const denylistedContent = Array.from(contentTargets.entries())
            .map(([hash, target]) => ({ hash, isDenylisted: isTargetDenylisted(target, queryResult) }))
            .filter(({ isDenylisted }) => isDenylisted)
            .map(({ hash }) => hash)

          const { auditInfo } = deployment
          const result = {
            ...deployment,
            content: isEntityDenylisted ? undefined : deployment.content,
            metadata: isEntityDenylisted ? DenylistServiceDecorator.DENYLISTED_METADATA : deployment.metadata,
            auditInfo: {
              ...auditInfo
            }
          }
          if (denylistedContent.length > 0) {
            result.auditInfo.denylistedContent = denylistedContent
          }
          if (isEntityDenylisted) {
            result.auditInfo.isDenylisted = true
          }
          return result
        })

        return {
          ...deploymentHistory,
          deployments: sanitizedDeployments
        }
      },
      {
        priority: DB_REQUEST_PRIORITY.HIGH
      }
    )
  }

  getPointerChanges(filters?: PointerChangesFilters, offset?: number, limit?: number, lastId?: string) {
    return this.service.getPointerChanges(filters, offset, limit, lastId)
  }

  getAllFailedDeployments() {
    return this.service.getAllFailedDeployments()
  }

  getStatus(): ServerStatus {
    return this.service.getStatus()
  }

  storeContent(fileHash: string, content: Buffer): Promise<void> {
    return this.service.storeContent(fileHash, content)
  }

  listenToDeployments(listener: DeploymentListener): void {
    return this.service.listenToDeployments(listener)
  }

  getEntitiesByIds(ids: EntityId[]): Promise<Entity[]> {
    return this.repository.task(
      async (task) => {
        const entities: Entity[] = await this.service.getEntitiesByIds(ids, task)
        return this.sanitizeEntities(task.denylist, entities)
      },
      {
        priority: DB_REQUEST_PRIORITY.HIGH
      }
    )
  }

  getEntitiesByPointers(type: EntityType, pointers: Pointer[]): Promise<Entity[]> {
    return this.repository.task(
      async (task) => {
        const nonDenylistedPointers: Pointer[] = await this.filterDenylisted(task.denylist, pointers, (pointer) =>
          buildPointerTarget(type, pointer)
        )
        const entities: Entity[] = await this.service.getEntitiesByPointers(type, nonDenylistedPointers, task)
        return this.sanitizeEntities(task.denylist, entities)
      },
      {
        priority: DB_REQUEST_PRIORITY.HIGH
      }
    )
  }

  getActiveDeploymentsByContentHash(hash: string) {
    return this.service.getActiveDeploymentsByContentHash(hash)
  }

  private async validateDeployment(
    denylistRepo: DenylistRepository,
    files: DeploymentFiles,
    entityId: EntityId,
    auditInfo: LocalDeploymentAuditInfo
  ) {
    // No deployments from denylisted eth addresses are allowed
    const ownerAddress = ContentAuthenticator.ownerAddress(auditInfo.authChain)
    if (await this.areDenylisted(denylistRepo, buildAddressTarget(ownerAddress))) {
      throw new Error(`Can't allow a deployment from address '${ownerAddress}' since it was denylisted.`)
    }

    // Find the entity file
    const hashes: Map<ContentFileHash, Uint8Array> = await ServiceImpl.hashFiles(files, entityId)
    const entityFile = hashes.get(entityId)
    if (!entityFile) {
      throw new Error(`Failed to find the entity file.`)
    }

    // Parse entity file into an Entity
    const entity: Entity = EntityFactory.fromBufferWithId(entityFile, entityId)

    // No deployments with denylisted hash are allowed
    const contentTargets: DenylistTarget[] = Array.from(entity.content?.values() ?? []).map((fileHash) =>
      buildContentTarget(fileHash)
    )
    if (await this.areDenylisted(denylistRepo, ...contentTargets)) {
      throw new Error(`Can't allow the deployment since the entity contains a denylisted content.`)
    }

    // No deployments on denylisted pointers are allowed
    const pointerTargets: DenylistTarget[] = entity.pointers.map((pointer) => buildPointerTarget(entity.type, pointer))
    if (await this.areDenylisted(denylistRepo, ...pointerTargets)) {
      throw new Error(`Can't allow the deployment since the entity contains a denylisted pointer.`)
    }

    return hashes
  }

  /** Since entity ids are also file hashes, we need to check for all possible targets */
  private getHashTargets(fileHash: string): DenylistTarget[] {
    return [...this.getEntityTargets(fileHash), buildContentTarget(fileHash)]
  }

  /** Since we don't know the entity type, we need to check check against all types */
  private getEntityTargets(entityId: EntityId) {
    const types: EntityType[] = Object.keys(EntityType).map((type) => EntityType[type])
    return types.map((entityType) => buildEntityTarget(entityType, entityId))
  }

  /** Filter out denylisted targets */
  private async filterDenylisted<T>(
    denylistRepo: DenylistRepository,
    elements: T[],
    targetBuild: (element: T) => DenylistTarget
  ): Promise<T[]> {
    const elementToTarget: Map<T, DenylistTarget> = new Map(elements.map((element) => [element, targetBuild(element)]))
    const areDenylisted = await this.denylist.areTargetsDenylisted(denylistRepo, Array.from(elementToTarget.values()))
    return Array.from(elementToTarget.entries())
      .filter(([, target]) => !isTargetDenylisted(target, areDenylisted))
      .map(([element]) => element)
  }

  /** When an entity is denylisted, we don't want to show its content and metadata  */
  private async sanitizeEntities(denylistRepo: DenylistRepository, entities: Entity[]): Promise<Entity[]> {
    // Build the target per entity
    const entityToTarget: Map<Entity, DenylistTarget> = new Map(
      entities.map((entity) => [entity, buildEntityTarget(entity.type, entity.id)])
    )

    // Check if targets are denylisted
    const denylistQueryResult = await this.denylist.areTargetsDenylisted(
      denylistRepo,
      Array.from(entityToTarget.values())
    )

    // Sanitize denylisted entities
    return entities.map((entity) => {
      const target = entityToTarget.get(entity)!
      const isDenylisted = isTargetDenylisted(target, denylistQueryResult)
      if (isDenylisted) {
        return { ...entity, content: undefined, metadata: DenylistServiceDecorator.DENYLISTED_METADATA }
      } else {
        return entity
      }
    })
  }

  /** Return true if any of the given targets is denylisted */
  private async areDenylisted(denylistRepo: DenylistRepository, ...targets: DenylistTarget[]): Promise<boolean> {
    const result = await this.denylist.areTargetsDenylisted(denylistRepo, targets)
    return Array.from(result.values())
      .map((subMap) => Array.from(subMap.values()))
      .reduce((prev, current) => prev || current.some((denylisted) => denylisted), false)
  }
}

function isTargetDenylisted(
  target: DenylistTarget,
  queryResult: Map<DenylistTargetType, Map<DenylistTargetId, boolean>>
): boolean {
  return queryResult.get(target.getType())?.get(target.getId()) ?? false
}
