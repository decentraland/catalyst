import { EthAddress } from "dcl-crypto";
import { Timestamp } from "@katalyst/content/service/time/TimeSorting";
import { ServerAddress } from "@katalyst/content/service/synchronization/clients/contentserver/ContentServerClient";
import { EntityId, EntityType, Entity } from "@katalyst/content/service/Entity";
import { DeploymentsRepository, DeploymentId } from "@katalyst/content/storage/repositories/DeploymentsRepository";
import { AuditInfo } from "../Audit";
import { ContentFilesRepository } from "@katalyst/content/storage/repositories/ContentFilesRepository";
import { MigrationDataRepository } from "@katalyst/content/storage/repositories/MigrationDataRepository";
import { CacheByType } from "../caching/Cache";
import { CacheManager, ENTITIES_CACHE_CONFIG } from "../caching/CacheManager";
import { DeploymentResult } from "../pointers/PointerManager";
import { DeploymentDeltasRepository } from "@katalyst/content/storage/repositories/DeploymentDeltasRepository";

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
            const deployments = await deploymentRepository.getEntitiesByIds(entityType, entityIds)
            const deploymentIds = deployments.map(row => row.id);
            const contents = await contentFilesRepository.getContentFiles(deploymentIds)
            return new Map(deployments.map(row => [row.entity_id, new Entity(row.entity_id, row.entity_type, row.entity_pointers, row.entity_timestamp, contents.get(row.id), row.entity_metadata)]))
        })
    }

    async getDeployments(deploymentsRepository: DeploymentsRepository, fromLocalTimestamp?: Timestamp, toLocalTimestamp?: Timestamp, offset?: number, limit?: number): Promise<PartialDeploymentHistory> {
        const curatedOffset = (offset && offset >= 0) ? offset : 0
        const curatedLimit = (limit && limit > 0 && limit <= DeploymentManager.MAX_HISTORY_LIMIT) ? limit : DeploymentManager.MAX_HISTORY_LIMIT

        const deployments: DeploymentEvent[] = await deploymentsRepository.getHistoricalDeploymentsByLocalTimestamp(curatedOffset, curatedLimit + 1, fromLocalTimestamp, toLocalTimestamp)
        const moreData = deployments.length > curatedLimit
        return {
            events: deployments.slice(0, curatedLimit),
            filters: {
                fromLocalTimestamp: fromLocalTimestamp,
                toLocalTimestamp: toLocalTimestamp,
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
        const migrationResult = await migrationDataRepository.getMigrationData(deploymentResult.id)

        const auditInfo: AuditInfo = {
            version: deploymentResult.version,
            deployedTimestamp: deploymentResult.origin_timestamp,
            originTimestamp: deploymentResult.origin_timestamp,
            localTimestamp: deploymentResult.local_timestamp,
            originServerUrl: deploymentResult.origin_server_url,
            authChain: deploymentResult.auth_chain,
            overwrittenBy: deploymentResult.overwritten_by,
            originalMetadata: migrationResult,
        }

        return auditInfo
    }

    setEntitiesAsOverwritten(deploymentsRepository: DeploymentsRepository, overwritten: Set<DeploymentId>, overwrittenBy: DeploymentId) {
        return deploymentsRepository.setEntitiesAsOverwritten(overwritten, overwrittenBy)
    }

    saveDelta(deploymentDeltasRepo: DeploymentDeltasRepository, deploymentId: DeploymentId, result: DeploymentResult) {
       return deploymentDeltasRepo.saveDelta(deploymentId, result)
    }

}

export type PartialDeploymentHistory = {
    events: DeploymentEvent[],
    filters: {
        fromLocalTimestamp?: Timestamp,
        toLocalTimestamp?: Timestamp,
    },
    pagination: {
        offset: number,
        limit: number,
        moreData: boolean,
    },
}

export type DeploymentEventBase = {
    entityType: EntityType,
    entityId: EntityId,
    originServerUrl: ServerAddress,
    originTimestamp: Timestamp,
}

export type DeploymentEvent = DeploymentEventBase & {
    localTimestamp: Timestamp,
    deployer: EthAddress,
}

export type DeploymentHistory = DeploymentEvent[]