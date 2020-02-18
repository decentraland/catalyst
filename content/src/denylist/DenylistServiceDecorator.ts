import { MetaverseContentService, ContentFile, ServerStatus } from "../service/Service";
import { Entity, EntityType, EntityId, Pointer } from "../service/Entity";
import { ContentFileHash } from "../service/Hashing";
import { Denylist } from "./Denylist";
import { buildPointerTarget, buildEntityTarget, DenylistTarget, buildContentTarget, buildAddressTarget } from "./DenylistTarget";
import { AuditInfo } from "../service/audit/Audit";
import { EntityFactory } from "../service/EntityFactory";
import { ServiceImpl } from "../service/ServiceImpl";
import { ContentItem } from "../storage/ContentStorage";
import { ContentAuthenticator } from "../service/auth/Authenticator";
import { Timestamp } from "../service/time/TimeSorting";

/**
 * This decorator takes a MetaverseContentService and adds denylisting functionality to it
 */
export class DenylistServiceDecorator implements MetaverseContentService {
  static DENYLISTED_METADATA: string = "Denylisted";

  constructor(private readonly service: MetaverseContentService, private readonly denylist: Denylist) {}

  async getEntitiesByPointers(type: EntityType, pointers: Pointer[]): Promise<Entity[]> {
    const nonDenylistedPointers: EntityId[] = await this.filterDenylisted(pointers, pointer => buildPointerTarget(type, pointer));
    const entities: Entity[] = await this.service.getEntitiesByPointers(type, nonDenylistedPointers);
    return this.sanitizeEntities(entities);
  }

  async getEntitiesByIds(type: EntityType, ids: EntityId[]): Promise<Entity[]> {
    const entities: Entity[] = await this.service.getEntitiesByIds(type, ids);
    return this.sanitizeEntities(entities);
  }

  async getActivePointers(type: EntityType): Promise<Pointer[]> {
    const activePointers: Pointer[] = await this.service.getActivePointers(type);
    return this.filterDenylisted(activePointers, pointer => buildPointerTarget(type, pointer));
  }

  async getContent(fileHash: ContentFileHash): Promise<ContentItem | undefined> {
    const isDenylisted = await this.isFileHashDenylisted(fileHash);
    if (isDenylisted) {
      return undefined;
    } else {
      return this.service.getContent(fileHash);
    }
  }

  /** Is content is denylisted, then we will return that it is not available */
  async isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<string, boolean>> {
    const availability: Map<ContentFileHash, boolean> = await this.service.isContentAvailable(fileHashes);
    const denylistedEntries = fileHashes.map<Promise<[ContentFileHash, boolean]>>(async fileHash => [fileHash, await this.isFileHashDenylisted(fileHash)])
    const denylisted: Map<ContentFileHash, boolean> = new Map(await Promise.all(denylistedEntries));

    for (const [fileHash, isDenylisted] of denylisted) {
      if (isDenylisted) {
        availability.set(fileHash, false);
      }
    }

    return availability;
  }

  async getAuditInfo(type: EntityType, id: EntityId): Promise<AuditInfo | undefined> {
    // Retrieve audit info and entity
    const auditInfo = await this.service.getAuditInfo(type, id);

    if (!auditInfo) {
      return undefined;
    } else {
      const entity = (await this.service.getEntitiesByIds(type, [id]))[0];

      // Build respective targets
      const entityTarget = buildEntityTarget(type, id);
      const contentTargets: Map<ContentFileHash, DenylistTarget> = new Map(Array.from(entity.content?.values() ?? []).map(fileHash => [fileHash, buildContentTarget(fileHash)]));
      const allTargets = [entityTarget, ...contentTargets.values()];

      // Check if any of the targets are denylisted
      const denylisted: Map<DenylistTarget, boolean> = await this.denylist.areTargetsDenylisted(allTargets);

      // Create new result
      let result: AuditInfo = {
        ...auditInfo
      };

      // If entity is denylisted, then mark it on the audit info
      if (denylisted.get(entityTarget)) {
        result.isDenylisted = true;
      }

      // If any of the content is denylisted, then add them to the audit info
      const denylistedContent: ContentFileHash[] = Array.from(contentTargets.entries())
        .filter(([, target]) => denylisted.get(target))
        .map(([fileHash]) => fileHash);

      if (denylistedContent.length > 0) {
        result.denylistedContent = denylistedContent;
      }

      return result;
    }
  }

  getStatus(): Promise<ServerStatus> {
    return this.service.getStatus();
  }

  async deployToFix(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfo, origin: string): Promise<Timestamp> {
    // Validate the deployment
    await this.validateDeployment(files, entityId, auditInfo)

    // If all validations passed, then deploy the entity
    return this.service.deployToFix(files, entityId, auditInfo, origin)
  }

  async deployEntity(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfo, origin: string): Promise<Timestamp> {
    // Validate the deployment
    await this.validateDeployment(files, entityId, auditInfo)

    // If all validations passed, then deploy the entity
    return this.service.deployEntity(files, entityId, auditInfo, origin);
  }

  private async validateDeployment(files: ContentFile[], entityId: EntityId, auditInfo: AuditInfo) {
    // No deployments from denylisted eth addresses are allowed
    const ownerAddress = ContentAuthenticator.ownerAddress(auditInfo);
    if (await this.areDenylisted(buildAddressTarget(ownerAddress))) {
      throw new Error(`Can't allow a deployment from address '${ownerAddress}' since it was denylisted.`);
    }

    // Find the entity file
    const entityFile: ContentFile = ServiceImpl.findEntityFile(files);

    // Parse entity file into an Entity
    const entity: Entity = EntityFactory.fromFile(entityFile, entityId);

    // No deployments with denylisted hash are allowed
    const contentTargets: DenylistTarget[] = Array.from(entity.content?.values() ?? []).map(fileHash => buildContentTarget(fileHash));
    if (await this.areDenylisted(...contentTargets)) {
      throw new Error(`Can't allow the deployment since the entity contains a denylisted content.`);
    }

    // No deployments on denylisted pointers are allowed
    const pointerTargets: DenylistTarget[] = entity.pointers.map(pointer => buildPointerTarget(entity.type, pointer));
    if (await this.areDenylisted(...pointerTargets)) {
      throw new Error(`Can't allow the deployment since the entity contains a denylisted pointer.`);
    }
  }

  /** When an entity is denylisted, we don't want to show its content and metadata  */
  private async sanitizeEntities(entities: Entity[]): Promise<Entity[]> {
    // Build the target per entity
    const entityToTarget: Map<Entity, DenylistTarget> = new Map(entities.map(entity => [entity, buildEntityTarget(entity.type, entity.id)]));

    // Check if targets are denylisted
    const isTargetDenylisted: Map<DenylistTarget, boolean> = await this.denylist.areTargetsDenylisted(Array.from(entityToTarget.values()));

    // Sanitize denylisted entities
    return entities.map(entity => {
      if (isTargetDenylisted.get(entityToTarget.get(entity) as DenylistTarget)) {
        return new Entity(entity.id, entity.type, entity.pointers, entity.timestamp, undefined, DenylistServiceDecorator.DENYLISTED_METADATA);
      } else {
        return entity;
      }
    });
  }

  /** Since entity ids are also file hashes, we need to check for all possible targets */
  private isFileHashDenylisted(fileHash: string) {
    return this.areDenylisted(...this.getEntityTargets(fileHash), buildContentTarget(fileHash));
  }

  /** Since we don't know the entity type, we need to check check against all types */
  private getEntityTargets(entityId: EntityId) {
    const types: EntityType[] = Object.keys(EntityType).map(type => EntityType[type]);
    return types.map(entityType => buildEntityTarget(entityType, entityId));
  }

  /** Return true if any of the given targets is denylisted */
  private async areDenylisted(...targets: DenylistTarget[]): Promise<boolean> {
    if (targets.length == 0) {
      return false;
    } else {
      const result = await this.denylist.areTargetsDenylisted(targets);
      return Array.from(result.values()).reduce((accum, currentValue) => accum || currentValue);
    }
  }

  /** Filter out denylisted targets */
  private async filterDenylisted<T>(elements: T[], targetBuild: (element: T) => DenylistTarget): Promise<T[]> {
    const elementToTarget: Map<T, DenylistTarget> = new Map(elements.map(element => [element, targetBuild(element)]));
    const areDenylisted = await this.denylist.areTargetsDenylisted(Array.from(elementToTarget.values()));
    return Array.from(elementToTarget.entries())
      .filter(([, target]) => !areDenylisted.get(target))
      .map(([element]) => element);
  }
}
