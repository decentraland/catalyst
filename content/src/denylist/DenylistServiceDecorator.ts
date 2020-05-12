import { MetaverseContentService, ContentFile, ServerStatus } from "../service/Service";
import { Entity, EntityType, EntityId, Pointer } from "../service/Entity";
import { ContentFileHash } from "../service/Hashing";
import { Denylist } from "./Denylist";
import { buildPointerTarget, buildEntityTarget, DenylistTarget, buildContentTarget, buildAddressTarget, DenylistTargetType, DenylistTargetId } from "./DenylistTarget";
import { AuditInfo, AuditInfoBase } from "../service/Audit";
import { EntityFactory } from "../service/EntityFactory";
import { ServiceImpl } from "../service/ServiceImpl";
import { ContentItem } from "../storage/ContentStorage";
import { ContentAuthenticator } from "../service/auth/Authenticator";
import { Timestamp } from "../service/time/TimeSorting";
import { Repository } from "../storage/Repository";
import { DenylistRepository } from "../storage/repositories/DenylistRepository";

/**
 * This decorator takes a MetaverseContentService and adds denylisting functionality to it
 */
export class DenylistServiceDecorator implements MetaverseContentService {
  static DENYLISTED_METADATA: string = "Denylisted";

  constructor(private readonly service: MetaverseContentService,
    private readonly denylist: Denylist,
    private readonly repository: Repository) {}

  async getEntitiesByPointers(type: EntityType, pointers: Pointer[]): Promise<Entity[]> {
    return this.repository.task(async task => {
      const nonDenylistedPointers: EntityId[] = await this.filterDenylisted(task.denylist, pointers, pointer => buildPointerTarget(type, pointer));
      const entities: Entity[] = await this.service.getEntitiesByPointers(type, nonDenylistedPointers, task);
      return this.sanitizeEntities(task.denylist, entities);
    })
  }

  async getEntitiesByIds(type: EntityType, ids: EntityId[]): Promise<Entity[]> {
    return this.repository.task(async task => {
      const entities: Entity[] = await this.service.getEntitiesByIds(type, ids, task);
      return this.sanitizeEntities(task.denylist, entities);
    })
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

  async getAuditInfo(type: EntityType, id: EntityId): Promise<AuditInfo | undefined> {
    return this.repository.task(async task => {
      // Retrieve audit info and entity
      const auditInfo = await this.service.getAuditInfo(type, id, task);

      if (!auditInfo) {
        return undefined;
      } else {
        const entity = (await this.service.getEntitiesByIds(type, [id], task))[0];

        // Build respective targets
        const entityTarget = buildEntityTarget(type, id);
        const contentTargets: Map<ContentFileHash, DenylistTarget> = new Map(Array.from(entity.content?.values() ?? []).map(fileHash => [fileHash, buildContentTarget(fileHash)]));
        const allTargets = [entityTarget, ...contentTargets.values()];

        // Check if any of the targets are denylisted
        const denylisted = await this.denylist.areTargetsDenylisted(task.denylist, allTargets);

        // Create new result
        let result: AuditInfo = {
          ...auditInfo
        };

        // If entity is denylisted, then mark it on the audit info
        if (isTargetDenylisted(entityTarget, denylisted)) {
          result.isDenylisted = true;
        }

        // If any of the content is denylisted, then add them to the audit info
        const denylistedContent: ContentFileHash[] = Array.from(contentTargets.entries())
          .filter(([, target]) => isTargetDenylisted(target, denylisted))
          .map(([fileHash]) => fileHash);

        if (denylistedContent.length > 0) {
          result.denylistedContent = denylistedContent;
        }

        return result;
      }
    })
  }

  async deployToFix(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfoBase, origin: string): Promise<Timestamp> {
    return this.repository.task(async task => {
      // Validate the deployment
      await this.validateDeployment(task.denylist, files, entityId, auditInfo)

      // If all validations passed, then deploy the entity
      return this.service.deployToFix(files, entityId, auditInfo, origin, task)
    })
  }

  async deployEntity(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfoBase, origin: string): Promise<Timestamp> {
    return this.repository.task(async task => {
      // Validate the deployment
      await this.validateDeployment(task.denylist, files, entityId, auditInfo)

      // If all validations passed, then deploy the entity
      return this.service.deployEntity(files, entityId, auditInfo, origin, task);
    })
  }

  async deployLegacy(files: ContentFile[], entityId: string, auditInfo: AuditInfoBase): Promise<Timestamp> {
    return this.repository.task(async task => {
      // Validate the deployment
      await this.validateDeployment(task.denylist, files, entityId, auditInfo)

      // If all validations passed, then deploy the entity
      return this.service.deployLegacy(files, entityId, auditInfo, task);
    })
  }


  getLegacyHistory(from?: number | undefined, to?: number | undefined, serverName?: string | undefined, offset?: number | undefined, limit?: number | undefined) {
    return this.service.getLegacyHistory(from, to, serverName, offset, limit)
  }

  getAllFailedDeployments() {
    return this.service.getAllFailedDeployments()
  }

  getStatus(): ServerStatus {
    return this.service.getStatus();
  }

  private async validateDeployment(denylistRepo: DenylistRepository, files: ContentFile[], entityId: EntityId, auditInfo: AuditInfoBase) {
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

  /** When an entity is denylisted, we don't want to show its content and metadata  */
  private async sanitizeEntities(denylistRepo: DenylistRepository, entities: Entity[]): Promise<Entity[]> {
    // Build the target per entity
    const entityToTarget: Map<Entity, DenylistTarget> = new Map(entities.map(entity => [entity, buildEntityTarget(entity.type, entity.id)]));

    // Check if targets are denylisted
    const queryResult = await this.denylist.areTargetsDenylisted(denylistRepo, Array.from(entityToTarget.values()));

    // Sanitize denylisted entities
    return entities.map(entity => {
      const target = entityToTarget.get(entity)!!
      const isDenylisted = isTargetDenylisted(target, queryResult)
      if (isDenylisted) {
        return new Entity(entity.id, entity.type, entity.pointers, entity.timestamp, undefined, DenylistServiceDecorator.DENYLISTED_METADATA);
      } else {
        return entity;
      }
    });
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
    if (targets.length == 0) {
      return false;
    } else {
      const result = await this.denylist.areTargetsDenylisted(denylistRepo, targets);
      return Array.from(result.values())
        .map(subMap => Array.from(subMap.values()))
        .reduce((prev, current) => prev || current.some(denylisted => denylisted), false)
    }
  }

  /** Filter out denylisted targets */
  private async filterDenylisted<T>(denylistRepo: DenylistRepository, elements: T[], targetBuild: (element: T) => DenylistTarget): Promise<T[]> {
    const elementToTarget: Map<T, DenylistTarget> = new Map(elements.map(element => [element, targetBuild(element)]));
    const areDenylisted = await this.denylist.areTargetsDenylisted(denylistRepo, Array.from(elementToTarget.values()));
    return Array.from(elementToTarget.entries())
      .filter(([, target]) => !isTargetDenylisted(target, areDenylisted))
      .map(([element]) => element);
  }
}

function isTargetDenylisted(target: DenylistTarget, queryResult: Map<DenylistTargetType, Map<DenylistTargetId, boolean>>): boolean {
    return queryResult.get(target.getType())?.get(target.getId()) ?? false
}