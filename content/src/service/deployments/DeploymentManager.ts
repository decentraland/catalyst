import { EthAddress, AuthChain } from "dcl-crypto";
import { Timestamp } from "@katalyst/content/service/time/TimeSorting";
import { ServerAddress } from "@katalyst/content/service/synchronization/clients/contentserver/ContentServerClient";
import { EntityId, EntityType, Entity, Pointer } from "@katalyst/content/service/Entity";
import { DeploymentsRepository, DeploymentId } from "@katalyst/content/storage/repositories/DeploymentsRepository";
import { AuditInfo, EntityVersion } from "../Audit";
import { ContentFilesRepository } from "@katalyst/content/storage/repositories/ContentFilesRepository";
import { MigrationDataRepository } from "@katalyst/content/storage/repositories/MigrationDataRepository";
import { CacheByType } from "../caching/Cache";
import { CacheManager, ENTITIES_CACHE_CONFIG } from "../caching/CacheManager";
import { DeploymentResult, DELTA_POINTER_RESULT } from "../pointers/PointerManager";
import { DeploymentDeltasRepository } from "@katalyst/content/storage/repositories/DeploymentDeltasRepository";
import { ContentFileHash } from "../Hashing";

export class DeploymentManager {

    private static MAX_HISTORY_LIMIT = 500

    private entities: CacheByType<EntityId, Entity>

    constructor(cacheManager: CacheManager) {
        this.entities = cacheManager.buildEntityTypedCache(ENTITIES_CACHE_CONFIG)
    }

    areEntitiesDeployed(deploymentRepository: DeploymentsRepository, entityIds: EntityId[]): Promise<Map<EntityId, boolean>> {
        return deploymentRepository.areEntitiesDeployed(entityIds)
    }

    getEntitiesByIds(deploymentRepository: DeploymentsRepository, contentFilesRepository: ContentFilesRepository, entityType: EntityType, entityIds: EntityId[]): Promise<Entity[]> {
        return this.entities.get(entityType, entityIds, async (type, ids) => {
            const deployments = await deploymentRepository.getEntitiesByIds(type, ids)
            const deploymentIds = deployments.map(row => row.id);
            const contents = await contentFilesRepository.getContentFiles(deploymentIds)
            return new Map(deployments.map(row => [row.entityId, new Entity(row.entityId, row.entityType, row.pointers, row.timestamp, contents.get(row.id), row.metadata)]))
        })
    }

    async getDeployments(
        deploymentsRepository: DeploymentsRepository,
        contentFilesRepository: ContentFilesRepository,
        migrationDataRepository: MigrationDataRepository,
        filters?: DeploymentFilters,
        offset?: number,
        limit?: number): Promise<PartialDeploymentHistory> {
        const curatedOffset = (offset && offset >= 0) ? offset : 0
        const curatedLimit = (limit && limit > 0 && limit <= DeploymentManager.MAX_HISTORY_LIMIT) ? limit : DeploymentManager.MAX_HISTORY_LIMIT

        const deploymentsWithExtra = await deploymentsRepository.getHistoricalDeploymentsByLocalTimestamp(curatedOffset, curatedLimit + 1, filters?.fromLocalTimestamp, filters?.toLocalTimestamp)
        const moreData = deploymentsWithExtra.length > curatedLimit

        const deploymentsResult = deploymentsWithExtra.slice(0, curatedLimit)
        const deploymentIds = deploymentsResult.map(({ deploymentId }) => deploymentId)
        const content = await contentFilesRepository.getContentFiles(deploymentIds)
        const migrationData = await migrationDataRepository.getMigrationData(deploymentIds)

        const deployments: Deployment[] = deploymentsResult.map(result => ({
            entityType: result.entityType,
            entityId: result.entityId,
            pointers: result.pointers,
            entityTimestamp: result.entityTimestamp,
            content: content.get(result.deploymentId),
            metadata: result.metadata,
            deployedBy: result.deployerAddress,
            auditInfo: {
                version: result.version,
                authChain: result.authChain,
                originServerUrl: result.originServerUrl,
                originTimestamp: result.originTimestamp,
                localTimestamp: result.localTimestamp,
                overwrittenBy: result.overwrittenBy,
                migrationData: migrationData.get(result.deploymentId),
            }
        }));
        return {
            deployments: deployments,
            filters: {
                ...filters,
            },
            pagination: {
                offset: curatedOffset,
                limit: curatedLimit,
                moreData: moreData,
            }
        }
    }

    async saveDeployment(deploymentsRepository: DeploymentsRepository,
        migrationDataRepository: MigrationDataRepository,
        contentRepository: ContentFilesRepository,
        entity: Entity,
        auditInfo: AuditInfo,
        overwrittenBy: DeploymentId | null): Promise<DeploymentId> {
            const deploymentId = await deploymentsRepository.saveDeployment(entity, auditInfo, overwrittenBy)
            if (auditInfo.originalMetadata) {
                await migrationDataRepository.saveMigrationData(deploymentId, auditInfo.originalMetadata)
            }

            if (entity.content) {
                await contentRepository.saveContentFiles(deploymentId, entity.content)
            }

            this.entities.invalidate(entity.type, entity.id)

            return deploymentId
    }

    async getAuditInfo(deploymentsRepository: DeploymentsRepository, migrationDataRepository: MigrationDataRepository, type: EntityType, id: EntityId): Promise<AuditInfo | undefined> {
        const deploymentResult = await deploymentsRepository.getAuditInfo(type, id)
        if (!deploymentResult) {
            return undefined
        }
        const migrationResult = await migrationDataRepository.getMigrationData(deploymentResult.deploymentId)

        const auditInfo: AuditInfo = {
            ...deploymentResult.auditInfo,
            deployedTimestamp: deploymentResult.auditInfo.originTimestamp,
            originalMetadata: migrationResult.get(deploymentResult.deploymentId),
        }

        return auditInfo
    }

    setEntitiesAsOverwritten(deploymentsRepository: DeploymentsRepository, overwritten: Set<DeploymentId>, overwrittenBy: DeploymentId) {
        return deploymentsRepository.setEntitiesAsOverwritten(overwritten, overwrittenBy)
    }

    async getDeltas(deploymentDeltasRepo: DeploymentDeltasRepository, deploymentsRepo: DeploymentsRepository): Promise<DeploymentDelta[]> {
        const deploymentsWithExtra = await deploymentsRepo.getHistoricalDeploymentsByLocalTimestamp(0, DeploymentManager.MAX_HISTORY_LIMIT, undefined, undefined)
        const deploymentIds = deploymentsWithExtra.map(({ deploymentId }) => deploymentId)
        const deltas = await deploymentDeltasRepo.getDeltasForDeployments(deploymentIds)

        return deploymentsWithExtra
            .map(({ deploymentId, entityId, entityType, localTimestamp }) => {
                const delta = deltas.get(deploymentId) ?? new Map()
                const changes = this.transformDelta(entityId, delta)
                return { entityType, entityId, localTimestamp, changes }
            })
    }

    saveDelta(deploymentDeltasRepo: DeploymentDeltasRepository, deploymentId: DeploymentId, result: DeploymentResult) {
       return deploymentDeltasRepo.saveDelta(deploymentId, result)
    }

    private transformDelta(deployedEntity: EntityId, input: Map<Pointer, { before: EntityId | undefined, after: DELTA_POINTER_RESULT }>): DeploymentDeltaChanges {
        const newEntries = Array.from(input.entries())
            .map<[Pointer, { before: EntityId | undefined, after: EntityId | undefined }]>(([ pointer, { before, after } ]) => [ pointer, { before, after: after ===  DELTA_POINTER_RESULT.SET ? deployedEntity : undefined } ])
        return new Map(newEntries)
    }

}

export type PartialDeploymentHistory = {
    deployments: Deployment[],
    filters: DeploymentFilters,
    pagination: {
        offset: number,
        limit: number,
        moreData: boolean,
    },
}

export type DeploymentFilters = {
    fromLocalTimestamp?: Timestamp
    toLocalTimestamp?: Timestamp
}

export type Deployment = {
    entityType: EntityType,
    entityId: EntityId,
    pointers: Pointer[],
    entityTimestamp: Timestamp,
    content?: Map<string, ContentFileHash>,
    metadata?: any,
    deployedBy: EthAddress,
    auditInfo: {
        version: EntityVersion,
        authChain: AuthChain,
        originServerUrl: ServerAddress,
        originTimestamp: Timestamp,
        localTimestamp: Timestamp,
        overwrittenBy?: EntityId,
        migrationData?: any,
        isDenylisted?: boolean,
        denylistedContent?: ContentFileHash[],
    }
}

export type DeploymentEventBase = {
    entityType: EntityType,
    entityId: EntityId,
    originServerUrl: ServerAddress,
    originTimestamp: Timestamp,
}

export type DeploymentDelta = {
    entityType: EntityType,
    entityId: EntityId,
    localTimestamp: Timestamp,
    changes: DeploymentDeltaChanges,
}

export type DeploymentDeltaChanges = Map<Pointer, { before: EntityId | undefined, after: EntityId | undefined }>

