import { EntityId, EntityType, Pointer, Timestamp, ContentFileHash, Deployment as ControllerDeployment, DeploymentFilters, PartialDeploymentHistory, ServerAddress, AuditInfo } from "dcl-catalyst-commons";
import { Entity } from "@katalyst/content/service/Entity";
import { DeploymentsRepository, DeploymentId } from "@katalyst/content/storage/repositories/DeploymentsRepository";
import { ContentFilesRepository } from "@katalyst/content/storage/repositories/ContentFilesRepository";
import { MigrationDataRepository } from "@katalyst/content/storage/repositories/MigrationDataRepository";
import { DeploymentResult, DELTA_POINTER_RESULT } from "../pointers/PointerManager";
import { DeploymentDeltasRepository } from "@katalyst/content/storage/repositories/DeploymentDeltasRepository";

export class DeploymentManager {

    private static MAX_HISTORY_LIMIT = 500

    areEntitiesDeployed(deploymentRepository: DeploymentsRepository, entityIds: EntityId[]): Promise<Map<EntityId, boolean>> {
        return deploymentRepository.areEntitiesDeployed(entityIds)
    }

    async getDeployments(
        deploymentsRepository: DeploymentsRepository,
        contentFilesRepository: ContentFilesRepository,
        migrationDataRepository: MigrationDataRepository,
        filters?: ExtendedDeploymentFilters,
        offset?: number,
        limit?: number): Promise<PartialDeploymentHistory<Deployment>> {
        const curatedOffset = (offset && offset >= 0) ? offset : 0
        const curatedLimit = (limit && limit > 0 && limit <= DeploymentManager.MAX_HISTORY_LIMIT) ? limit : DeploymentManager.MAX_HISTORY_LIMIT

        const deploymentsWithExtra = await deploymentsRepository.getHistoricalDeploymentsByLocalTimestamp(curatedOffset, curatedLimit + 1, filters)
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
            if (auditInfo.migrationData) {
                await migrationDataRepository.saveMigrationData(deploymentId, auditInfo.migrationData)
            }

            if (entity.content) {
                await contentRepository.saveContentFiles(deploymentId, entity.content)
            }


            return deploymentId
    }

    setEntitiesAsOverwritten(deploymentsRepository: DeploymentsRepository, overwritten: Set<DeploymentId>, overwrittenBy: DeploymentId) {
        return deploymentsRepository.setEntitiesAsOverwritten(overwritten, overwrittenBy)
    }

    async getDeltas(filters: DeltaFilters, deploymentDeltasRepo: DeploymentDeltasRepository, deploymentsRepo: DeploymentsRepository, offset?: number,
        limit?: number): Promise<PartialDeploymentDeltas> {
            const curatedOffset = (offset && offset >= 0) ? offset : 0
        const curatedLimit = (limit && limit > 0 && limit <= DeploymentManager.MAX_HISTORY_LIMIT) ? limit : DeploymentManager.MAX_HISTORY_LIMIT
        const deploymentsWithExtra = await deploymentsRepo.getHistoricalDeploymentsByLocalTimestamp(curatedOffset, curatedLimit + 1, { ...filters, entityTypes: [filters.entityType] })
        const moreData = deploymentsWithExtra.length > curatedLimit

        const deployments = deploymentsWithExtra.slice(0, curatedLimit)
        const deploymentIds = deployments.map(({ deploymentId }) => deploymentId)
        const deltasForDeployments = await deploymentDeltasRepo.getDeltasForDeployments(deploymentIds)
        const deltas: DeploymentDelta[] = deployments
            .map(({ deploymentId, entityId, entityType, localTimestamp }) => {
                const delta = deltasForDeployments.get(deploymentId) ?? new Map()
                const changes = this.transformDelta(entityId, delta)
                return { entityType, entityId, localTimestamp, changes }
            })
        return {
            deltas,
            filters: {
                fromLocalTimestamp: filters.fromLocalTimestamp,
                toLocalTimestamp: filters.toLocalTimestamp,
            },
            pagination: {
                offset: curatedOffset,
                limit: curatedLimit,
                moreData,
            }
        }
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

export type Deployment = Omit<ControllerDeployment, 'content'> & { content?: Map<string, ContentFileHash> };

export type ExtendedDeploymentFilters = DeploymentFilters & {
    fromOriginTimestamp?: Timestamp,
    toOriginTimestamp?: Timestamp,
    originServerUrl?: ServerAddress,
}

export type DeploymentDelta = {
    entityType: EntityType,
    entityId: EntityId,
    localTimestamp: Timestamp,
    changes: DeploymentDeltaChanges,
}

export declare type PartialDeploymentDeltas = {
    deltas: DeploymentDelta[],
    filters: Omit<DeltaFilters, 'entityType'>,
    pagination: {
        offset: number;
        limit: number;
        moreData: boolean;
    };
};

export type DeltaFilters = Pick<DeploymentFilters, 'fromLocalTimestamp' | 'toLocalTimestamp'> & { entityType: EntityType }

export type DeploymentDeltaChanges = Map<Pointer, { before: EntityId | undefined, after: EntityId | undefined }>

