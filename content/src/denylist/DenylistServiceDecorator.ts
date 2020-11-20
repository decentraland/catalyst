import { EntityType, Pointer, EntityId, ContentFileHash, Timestamp, DeploymentFilters, PartialDeploymentHistory, ServerStatus, SortingCondition } from "dcl-catalyst-commons";
import { MetaverseContentService, LocalDeploymentAuditInfo, DeploymentListener } from "../service/Service";
import { Entity } from "../service/Entity";
import { Denylist } from "./Denylist";
import { buildPointerTarget, buildEntityTarget, DenylistTarget, buildContentTarget, buildAddressTarget, DenylistTargetType, DenylistTargetId } from "./DenylistTarget";
import { EntityFactory } from "../service/EntityFactory";
import { ServiceImpl } from "../service/ServiceImpl";
import { ContentItem } from "../storage/ContentStorage";
import { ContentAuthenticator } from "../service/auth/Authenticator";
import { Repository } from "../storage/Repository";
import { DenylistRepository } from "../storage/repositories/DenylistRepository";
import { Deployment, PointerChangesFilters } from "../service/deployments/DeploymentManager";
import { ContentFile } from "../controller/Controller";

/**
 * This decorator takes a MetaverseContentService and adds denylisting functionality to it
 */
export class DenylistServiceDecorator implements MetaverseContentService {
  static DENYLISTED_METADATA: string = "Denylisted";

  constructor(private readonly service: MetaverseContentService,
    private readonly denylist: Denylist,
    private readonly repository: Repository) { }

  start(): Promise<void> {
    return this.service.start()
  }

  async getContent(fileHash: ContentFileHash): Promise<ContentItem | undefined> {
    const isDenylisted = await this.areDenylisted(this.repository.denylist, ...this.getHashTargets(fileHash));
    if (isDenylisted) {
      return undefined;
    } else {
      return this.service.getContent(fileHash);
    }
  }

  /** Is content is denylisted, then we will return that it is not available */
  async isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<string, boolean>> {
    const availability: Map<ContentFileHash, boolean> = await this.service.isContentAvailable(fileHashes);
    const onlyAvailable: ContentFileHash[] = Array.from(availability.entries())
      .filter(([, available]) => available)
      .map(([hash]) => hash)
    const hashToTargets = new Map(onlyAvailable.map(hash => [hash, this.getHashTargets(hash)]))
    const allTargets = Array.from(hashToTargets.values())
      .reduce((curr, next) => curr.concat(next), [])
    const result = await this.denylist.areTargetsDenylisted(this.repository.denylist, allTargets)

    for (const [fileHash, targets] of hashToTargets) {
      const isDenylisted = targets.some(target => isTargetDenylisted(target, result))
      if (isDenylisted) {
        availability.set(fileHash, false);
      }
    }

    return availability;
  }

  async deployToFix(files: ContentFile[], entityId: EntityId, auditInfo: LocalDeploymentAuditInfo, origin: string): Promise<Timestamp> {
    return this.repository.task(async task => {
      // Validate the deployment
      await this.validateDeployment(task.denylist, files, entityId, auditInfo)

      // If all validations passed, then deploy the entity
      return this.service.deployToFix(files, entityId, auditInfo, origin, task)
    })
  }

  async deployEntity(files: ContentFile[], entityId: EntityId, auditInfo: LocalDeploymentAuditInfo, origin: string): Promise<Timestamp> {
    return this.repository.task(async task => {
      // Validate the deployment
      await this.validateDeployment(task.denylist, files, entityId, auditInfo)

      // If all validations passed, then deploy the entity
      return this.service.deployEntity(files, entityId, auditInfo, origin, task);
    })
  }

  async deployLocalLegacy(files: ContentFile[], entityId: string, auditInfo: LocalDeploymentAuditInfo): Promise<Timestamp> {
    return this.repository.task(async task => {
      // Validate the deployment
      await this.validateDeployment(task.denylist, files, entityId, auditInfo)

      // If all validations passed, then deploy the entity
      return this.service.deployLocalLegacy(files, entityId, auditInfo, task);
    })
  }

  deleteContent(fileHashes: string[]): Promise<void> {
    return this.service.deleteContent(fileHashes)
  }

  async getDeployments(sortingCondition: SortingCondition, filters?: DeploymentFilters, offset?: number, limit?: number): Promise<PartialDeploymentHistory<Deployment>> {
    return this.repository.task(async task => {
      const deploymentHistory = await this.service.getDeployments(sortingCondition, filters, offset, limit, task)

      // Prepare holders
      const entityTargetsByEntity: Map<EntityId, DenylistTarget> = new Map()
      const contentTargetsByEntity: Map<EntityId, Map<ContentFileHash, DenylistTarget>> = new Map()
      const pointerTargetsByEntity: Map<EntityId, Map<Pointer, DenylistTarget>> = new Map()
      const allTargets: DenylistTarget[] = []

      // Calculate and group targets by entity
      deploymentHistory.deployments.forEach(({ entityId, entityType, content, pointers }) => {
        const entityTarget = buildEntityTarget(entityType, entityId);
        const hashTargets: Map<ContentFileHash, DenylistTarget> = !content ? new Map() : new Map(Array.from(content.entries())
          .map(([, hash]) => [hash, buildContentTarget(hash)]))
        const pointerTargets: Map<Pointer, DenylistTarget> = new Map(pointers.map(pointer => [pointer, buildPointerTarget(entityType, pointer)]))
        entityTargetsByEntity.set(entityId, entityTarget);
        contentTargetsByEntity.set(entityId, hashTargets);
        pointerTargetsByEntity.set(entityId, pointerTargets);
        allTargets.push(entityTarget, ...hashTargets.values(), ...pointerTargets.values())
      })

      // Check which targets are denylisted
      const queryResult = await this.denylist.areTargetsDenylisted(task.denylist, allTargets)

      // Filter out deployments with blacklisted pointers
      const filteredDeployments = deploymentHistory.deployments.filter(({ entityId, pointers }) => {
        if (filters?.pointers && filters.pointers.length > 0) {
          // Calculate the intersection between the pointers used to filter, and the deployment's pointers. Consider that the intersection can't be empty
          const intersection = filters.pointers.filter(pointer => pointers.includes(pointer))
          const pointerTargets: Map<Pointer, DenylistTarget> = pointerTargetsByEntity.get(entityId)!!
          // Check if there is at least one pointer on the intersection that is not denylisted
          const isAtLeastOnePointerNotDenylisted = intersection
            .map(pointer => pointerTargets.get(pointer)!!)
            .some(target => !isTargetDenylisted(target, queryResult))
          // If there is one pointer on the intersection that is not denylisted, then the entity shouldn't be filtered out
          return isAtLeastOnePointerNotDenylisted
        }
        return true
      })

      // Perform sanitization
      const sanitizedDeployments = filteredDeployments.map(deployment => {
        const { entityId } = deployment
        const entityTarget = entityTargetsByEntity.get(entityId)!!
        const contentTargets = contentTargetsByEntity.get(entityId)!!

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
            ...auditInfo,

          },
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
        deployments: sanitizedDeployments,
      }
    })
  }

  getPointerChanges(filters?: PointerChangesFilters, offset?: number, limit?: number) {
    return this.service.getPointerChanges(filters, offset, limit, this.repository)
  }

  getAllFailedDeployments() {
    return this.service.getAllFailedDeployments()
  }

  getStatus(): ServerStatus {
    return this.service.getStatus();
  }

  storeContent(fileHash: string, content: Buffer): Promise<void> {
    return this.service.storeContent(fileHash, content)
  }

  listenToDeployments(listener: DeploymentListener): void {
    return this.service.listenToDeployments(listener)
  }

  private async validateDeployment(denylistRepo: DenylistRepository, files: ContentFile[], entityId: EntityId, auditInfo: LocalDeploymentAuditInfo) {
    // No deployments from denylisted eth addresses are allowed
    const ownerAddress = ContentAuthenticator.ownerAddress(auditInfo.authChain);
    if (await this.areDenylisted(denylistRepo, buildAddressTarget(ownerAddress))) {
      throw new Error(`Can't allow a deployment from address '${ownerAddress}' since it was denylisted.`);
    }

    // Find the entity file
    const entityFile: ContentFile = ServiceImpl.findEntityFile(files);

    // Parse entity file into an Entity
    const entity: Entity = EntityFactory.fromFile(entityFile, entityId);

    // No deployments with denylisted hash are allowed
    const contentTargets: DenylistTarget[] = Array.from(entity.content?.values() ?? []).map(fileHash => buildContentTarget(fileHash));
    if (await this.areDenylisted(denylistRepo, ...contentTargets)) {
      throw new Error(`Can't allow the deployment since the entity contains a denylisted content.`);
    }

    // No deployments on denylisted pointers are allowed
    const pointerTargets: DenylistTarget[] = entity.pointers.map(pointer => buildPointerTarget(entity.type, pointer));
    if (await this.areDenylisted(denylistRepo, ...pointerTargets)) {
      throw new Error(`Can't allow the deployment since the entity contains a denylisted pointer.`);
    }
  }

  /** Since entity ids are also file hashes, we need to check for all possible targets */
  private getHashTargets(fileHash: string): DenylistTarget[] {
    return [...this.getEntityTargets(fileHash), buildContentTarget(fileHash)]
  }

  /** Since we don't know the entity type, we need to check check against all types */
  private getEntityTargets(entityId: EntityId) {
    const types: EntityType[] = Object.keys(EntityType).map(type => EntityType[type]);
    return types.map(entityType => buildEntityTarget(entityType, entityId));
  }

  /** Return true if any of the given targets is denylisted */
  private async areDenylisted(denylistRepo: DenylistRepository, ...targets: DenylistTarget[]): Promise<boolean> {
    const result = await this.denylist.areTargetsDenylisted(denylistRepo, targets);
    return Array.from(result.values())
      .map(subMap => Array.from(subMap.values()))
      .reduce((prev, current) => prev || current.some(denylisted => denylisted), false)
  }

}

function isTargetDenylisted(target: DenylistTarget, queryResult: Map<DenylistTargetType, Map<DenylistTargetId, boolean>>): boolean {
  return queryResult.get(target.getType())?.get(target.getId()) ?? false
}