import { EntityType, EntityId } from "../Entity";
import { Timestamp } from "../time/TimeSorting";
import { DeploymentEvent } from "../history/HistoryManager";
import { FailedDeploymentsStorage } from "./FailedDeploymentsStorage";

/** This manager will remember all failed deployments */
export class FailedDeploymentsManager {

    constructor(private readonly storage: FailedDeploymentsStorage) { }

    reportFailedDeployment(deployment: DeploymentEvent, reason: FailureReason): Promise<void> {
        return this.storage.addFailedDeployment({ deployment, reason, moment: Date.now() })
    }

    getAllFailedDeployments(): Promise<FailedDeployment[]> {
        return this.storage.getAllFailedDeployments()
    }

    reportSuccessfulDeployment(entityType: EntityType, entityId: EntityId): Promise<void> {
        return this.storage.deleteDeploymentEventIfPresent(entityType, entityId)
    }

    async getDeploymentStatus(entityType: EntityType, entityId: EntityId): Promise<DeploymentStatus> {
        const failedDeployments: FailedDeployment[] = await this.getAllFailedDeployments()
        if (failedDeployments) {
            return this.findStatus(failedDeployments, entityType, entityId)
        }
        return NoFailure.SUCCESS
    }

    private async findStatus(failedDeployments: FailedDeployment[], entityType: EntityType, entityId: EntityId): Promise<DeploymentStatus> {
        for (const failedDeployment of failedDeployments) {
            if (failedDeployment.deployment.entityId === entityId &&
                failedDeployment.deployment.entityType === entityType) {
                return failedDeployment.reason;
            }
        }
        return NoFailure.SUCCESS
    }
}

export type FailedDeployment = {
    deployment: DeploymentEvent,
    reason: FailureReason,
    moment: Timestamp,
}

export enum FailureReason {
    UNKNOWN_ENTITY = "Unknown entity", // During sync, we couldn't fetch the entity
    FETCH_PROBLEM = "Fetch problem", // During sync, we could learn the entity, but we couldn't fetch some of its files or audit info
    DEPLOYMENT_ERROR = "Deployment error", // During sync, there was an error during deployment. Could be due to a validation
}

export enum NoFailure {
    SUCCESS
}

export type DeploymentStatus = FailureReason | NoFailure