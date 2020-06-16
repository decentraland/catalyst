import log4js from "log4js"
import { EntityId, ContentFile, ENTITY_FILE_NAME, ContentFileHash } from "dcl-catalyst-commons";
import { ContentServerClient } from "./clients/contentserver/ContentServerClient";
import { Entity } from "../Entity";
import { ClusterDeploymentsService } from "../Service";
import { ContentCluster } from "./ContentCluster";
import { LegacyAuditInfo, AuditInfoExternal } from "../Audit";
import { tryOnCluster } from "./ClusterUtils";
import { EntityFactory } from "../EntityFactory";
import { EventStreamProcessor } from "./EventStreamProcessor";
import { FailureReason } from "../errors/FailedDeploymentsManager";
import { DeploymentEventBase } from "../deployments/DeploymentManager";

export class EventDeployer {

    private static readonly ILLEGAL_ENTITIES: Set<EntityId> = new Set([
        "QmNn2oVpyXxNzhM8nZa4jsUu76e8EXbYDs7NaPjb8aFuxj",
        "QmbTsE4NJ1Mg82YF2xVbfkFRWkxzSJfVFgQw5eiaGNk3TH",
        "QmPJ4Ct9A3a2tVB1Cse56xxUa4MmfvLQntLeNbcvLmZgMc",
        "Qmd7fJe4qWMfzXjgqX65GPa6tDfhMuGP2npyf1brtrUPv5",
        "QmeCfwXhvXyuXcWx9eM3FCkdd5PxQ3shZtmnhWaWsAeeft",
        "QmRUp4RoTa32PLj4VC5bwfmwDc3SMBVUdsk6rzKpPLzgzf",
        "QmcvfmuW3n29pXzYNobH4FiXKBycjA79wV49JtAr8At619",
        "QmYE3oq6J59J3hEnNWYds5dn1BXa3uMFFroMTN7ZaRFVKt",
        "QmRmN36qtANL8M7x7s69ndyMe3oWKk9bViePJJNp3SKS8f",
    ])
    private static readonly LOGGER = log4js.getLogger('EventDeployer');

    private readonly eventProcessor: EventStreamProcessor

    constructor(private readonly cluster: ContentCluster,
        private readonly service: ClusterDeploymentsService) {
            this.eventProcessor = new EventStreamProcessor((event, source) => this.wrapDeployment(this.prepareDeployment(event, source)))
        }

    deployHistories(histories: DeploymentEventBase[][], options?: HistoryDeploymentOptions) {
        // Remove duplicates
        const map: Map<EntityId, DeploymentEventBase> = new Map()
        histories.forEach(history => history.forEach(event => map.set(event.entityId, event)))

        // Unify
        const unifiedHistory = Array.from(map.values())

        // Deploy
        return this.deployHistory(unifiedHistory, options)
    }

    async deployHistory(history: DeploymentEventBase[], options?: HistoryDeploymentOptions) {
        // Determine whether I already know the entities
        const entitiesInHistory: EntityId[] = history.map(({ entityId }) => entityId)
        const deployInfo = await this.service.areEntitiesAlreadyDeployed(entitiesInHistory)
        const newEntities: Set<EntityId> = new Set(Array.from(deployInfo.entries())
            .filter(([, deployed]) => !deployed)
            .map(([entityId]) => entityId)
            .filter(entityId => !EventDeployer.ILLEGAL_ENTITIES.has(entityId)))

        // Keep only new deployments
        const newDeployments = history.filter(event => newEntities.has(event.entityId));

        if (history.length > 0) {
            EventDeployer.LOGGER.debug(`History had ${history.length} entities, only ${newDeployments.length} new.`)
            if (newDeployments.length > 0) {
                EventDeployer.LOGGER.debug(`Will start to deploy the ${newDeployments.length} new entities.`)
            }
        }

        // Process history and deploy it
        return this.eventProcessor.deployHistory(newDeployments, options)
    }

    /** Download and prepare everything necessary to deploy an entity */
    private async prepareDeployment(deployment: DeploymentEventBase, source?: ContentServerClient): Promise<DeploymentExecution> {
        EventDeployer.LOGGER.trace(`Downloading files for entity (${deployment.entityType}, ${deployment.entityId})`)

        // Download the entity file
        const entityFile: ContentFile | undefined = await this.getEntityFile(deployment, source);

        // Get the audit info
        const legacyAuditInfo: LegacyAuditInfo | undefined = await this.getAuditInfo(deployment, source)
        const auditInfo: AuditInfoExternal | undefined = !legacyAuditInfo ? undefined : { ...legacyAuditInfo, ...deployment }

        if (entityFile && auditInfo) {
            if (auditInfo.overwrittenBy) {
                // Deploy the entity as overwritten
                return this.buildDeploymentExecution(deployment, () => this.service.deployOverwrittenEntityFromCluster(entityFile, deployment.entityId, auditInfo))
            } else {
                // Build entity
                const entity: Entity = EntityFactory.fromFile(entityFile, deployment.entityId)

                // Download all entity's files
                const files: ContentFile[] | undefined = await this.getContentFiles(entity, source)

                if (files) {
                    // Add the entity file to the list of files
                    files.unshift(entityFile)

                    // Since we could fetch all files, deploy the new entity normally
                    return this.buildDeploymentExecution(deployment, () => this.service.deployEntityFromCluster(files, deployment.entityId, auditInfo))
                } else {
                    // Looks like there was a problem fetching one of the files
                    await this.reportError(deployment, FailureReason.FETCH_PROBLEM)
                    throw new Error('Failed to download some content')
                }
            }
        } else if (!auditInfo) {
            await this.reportError(deployment, FailureReason.NO_ENTITY_OR_AUDIT)
            throw new Error('Failed to fetch the audit info')
        } else {
            // It looks like we could fetch the audit info, but not the entity file
            await this.reportError(deployment, FailureReason.NO_ENTITY_OR_AUDIT)
            throw new Error('Failed to fetch the entity file')
        }
    }

    /**
     * Get all the files needed to deploy the new entity
     */
    private async getContentFiles(entity: Entity, source?: ContentServerClient): Promise<ContentFile[] | undefined> {
        // Read the entity, and get all content file hashes
        const allFileHashes: ContentFileHash[] = Array.from(entity.content?.values() ?? [])

        // Check which files we already have
        const unknownFileHashes = await this.filterOutKnownFiles(allFileHashes)
        EventDeployer.LOGGER.trace(`In total, will need to download ${unknownFileHashes.length} files for entity (${entity.type}, ${entity.id})`)

        // Download all content files
        const files: ContentFile[] = []
        for (let i = 0; i < unknownFileHashes.length; i++) {
            const fileHash = unknownFileHashes[i]
            EventDeployer.LOGGER.trace(`Going to download file ${i + 1}/${unknownFileHashes.length} for entity (${entity.type}, ${entity.id}). Hash is ${fileHash}`)
            const file = await this.getFileOrUndefined(fileHash, source);
            if (file) {
                files.push(file)
                EventDeployer.LOGGER.trace(`Downloaded file ${i + 1}/${unknownFileHashes.length} for entity (${entity.type}, ${entity.id}). Hash was ${fileHash}`)
            } else {
                EventDeployer.LOGGER.trace(`Failed to download file ${i + 1}/${unknownFileHashes.length} for entity (${entity.type}, ${entity.id}). Hash was ${fileHash}. Will cancel content download`)
                return undefined
            }
        }

        return files
    }

    private async getEntityFile(deployment: DeploymentEventBase, source?: ContentServerClient): Promise<ContentFile | undefined> {
        const file: ContentFile | undefined = await this.getFileOrUndefined(deployment.entityId, source)

        // If we could download the entity file, rename it
        if (file) {
            file.name = ENTITY_FILE_NAME
        }
        return file
    }

    /**
     * This method tries to get a file from the other servers on the DAO. If all the request fail, then it returns 'undefined'.
     */
    private getFileOrUndefined(fileHash: ContentFileHash, source?: ContentServerClient): Promise<ContentFile | undefined> {
        return this.tryOnClusterOrUndefined(server => server.getContentFile(fileHash), this.cluster, `get file with hash '${fileHash}'`, { preferred: source })
    }

    private getAuditInfo(deployment: DeploymentEventBase, source?: ContentServerClient): Promise<LegacyAuditInfo | undefined> {
        return this.tryOnClusterOrUndefined(server => server.getAuditInfo(deployment.entityType, deployment.entityId), this.cluster, `get audit info for (${deployment.entityType}, ${deployment.entityId})`, { preferred: source })
    }

    private async filterOutKnownFiles(hashes: ContentFileHash[]): Promise<ContentFileHash[]> {
        // Check if we already have any of the files
        const availableContent: Map<ContentFileHash, Boolean> = await this.service.isContentAvailable(hashes)

        // Filter out files that we already have
        return Array.from(availableContent.entries())
            .filter(([_, isAlreadyAvailable]) => !isAlreadyAvailable)
            .map(([fileHash, _]) => fileHash)
    }

    private reportError(deployment: DeploymentEventBase, reason: FailureReason, description?: string): Promise<null> {
        const { entityType, entityId, originTimestamp, originServerUrl } = deployment
        return this.service.reportErrorDuringSync(entityType, entityId, originTimestamp, originServerUrl, reason, description)
    }

    private buildDeploymentExecution(deploymentEvent: DeploymentEventBase, execution: () => Promise<void>): DeploymentExecution {
        return {
            metadata: {
                deploymentEvent,
            },
            execution,
        }
    }

     /** Wrap the deployment, so if it fails, we can take action */
     private async wrapDeployment(deploymentPreparation: Promise<DeploymentExecution>): Promise<() => Promise<void>> {
        const deploymentExecution = await deploymentPreparation
        return async () => {
            try {
                await deploymentExecution.execution()
            } catch (error) {
                // The deployment failed, so we report it
                await this.reportError(deploymentExecution.metadata.deploymentEvent, FailureReason.DEPLOYMENT_ERROR, error.message)
                // Re throw the error
                throw error
            }
        }
    }

    /** Execute an operation on the cluster, but return 'undefined' if it fails */
    private async tryOnClusterOrUndefined<T>(execution: (server: ContentServerClient) => Promise<T>, cluster: ContentCluster, description: string, options?: { retries?: number, preferred?: ContentServerClient}): Promise<T | undefined> {
        try {
            return await tryOnCluster(execution, cluster, description, options)
        } catch (error) {
            return undefined
        }
    }
}

export type DeploymentExecution = {
    metadata: {
        deploymentEvent: DeploymentEventBase
    },
    execution: () => Promise<void>,
}

export type HistoryDeploymentOptions = {
    logging?: boolean,
    preferredServer?: ContentServerClient
}