import { Writable } from "stream";
import { EntityType, EntityId } from "../Entity";
import { DeploymentEvent } from "../history/HistoryManager";
import { FailedDeploymentsStorage } from "./FailedDeploymentsStorage";
import { StreamPipeline } from "@katalyst/content/helpers/StreamHelper";

/** This manager will remember all failed deployments */
export class FailedDeploymentsManager {

    constructor(private readonly storage: FailedDeploymentsStorage) { }

    reportFailedDeployment(deployment: DeploymentEvent, reason: FailureReason): Promise<void> {
        return this.storage.addFailedDeployment({ deployment, status: DeploymentStatus[reason]})
    }

    getAllFailedDeployments(): StreamPipeline {
        return this.storage.getAllFailedDeployments()
    }

    reportSuccessfulDeployment(entityType: EntityType, entityId: EntityId): Promise<void> {
        return this.storage.deleteDeploymentEventIfPresent(entityType, entityId)
    }

    getDeploymentStatus(entityType: EntityType, entityId: EntityId): Promise<DeploymentStatus> {
        const failedDeployments: StreamPipeline = this.getAllFailedDeployments()
        return this.findStatus(failedDeployments, entityType, entityId)
    }

    private async findStatus(failedDeploymentsStream: StreamPipeline, entityType: EntityType, entityId: EntityId): Promise<DeploymentStatus> {
        let status: DeploymentStatus = DeploymentStatus.SUCCESSFUL
        const stream = new Writable({
            objectMode: true,
            write: async (failedDeployment: FailedDeployment, _, done) => {
                if (failedDeployment.deployment.entityId === entityId &&
                    failedDeployment.deployment.entityType === entityType &&
                    status == DeploymentStatus.SUCCESSFUL) {
                    status = failedDeployment.status
                    failedDeploymentsStream.destroy()
                }
                done()
            }
        });

        await failedDeploymentsStream.addAndExecute(stream)
        return status
    }
}

export type FailedDeployment = {
    deployment: DeploymentEvent,
    status: DeploymentStatus
}

export enum FailureReason {
    UNKNOWN_ENTITY = "UNKNOWN_ENTITY",
    FETCH_PROBLEM = "FETCH_PROBLEM",
    DEPLOYMENT_ERROR = "DEPLOYMENT_ERROR"
}

export enum DeploymentStatus {
    SUCCESSFUL = "Successful", // Deployment was successful
    UNKNOWN_ENTITY = "Unknown entity", // During sync, we couldn't fetch the entity
    FETCH_PROBLEM = "Fetch problem", // During sync, we could learn the entity, but we couldn't fetch some of its files or audit info
    DEPLOYMENT_ERROR = "Deployment error", // During sync, there was an error during deployment. Could be due to a validation
}