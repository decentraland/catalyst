import { EntityType, EntityId } from "../Entity";
import { Timestamp } from "../time/TimeSorting";
import { DeploymentEvent } from "../history/HistoryManager";
import { FailedDeploymentsStorage } from "./FailedDeploymentsStorage";
import { ServerName } from "../naming/NameKeeper";

/**
 * This manager will handle all failed deployments
 */
export class FailedDeploymentsManager {

    constructor(private readonly storage: FailedDeploymentsStorage) { }

    reportFailure(entityType: EntityType, entityId: EntityId, deploymentTimestamp: Timestamp, serverName: ServerName, reason: FailureReason): Promise<void> {
        const deployment = { entityType, entityId, timestamp: deploymentTimestamp, serverName  }
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
        return this.findStatus(failedDeployments, entityType, entityId)
    }

    private async findStatus(failedDeployments: FailedDeployment[], entityType: EntityType, entityId: EntityId): Promise<DeploymentStatus> {
        for (const failedDeployment of failedDeployments) {
            if (failedDeployment.deployment.entityId === entityId &&
                failedDeployment.deployment.entityType === entityType) {
                return failedDeployment.reason;
            }
        }
        return NoFailure.NOT_MARKED_AS_FAILED
    }
}

export type FailedDeployment = {
    deployment: DeploymentEvent,
    reason: FailureReason,
    moment: Timestamp,
}

export enum FailureReason {
    NO_ENTITY_OR_AUDIT = "No entity or audit", // During sync, we couldn't fetch the entity or the audit info
    FETCH_PROBLEM = "Fetch problem", // During sync, we could learn the entity and the audit, but we couldn't fetch some of its files
    DEPLOYMENT_ERROR = "Deployment error", // During sync, there was an error during deployment. Could be due to a validation
}

export enum NoFailure {
    NOT_MARKED_AS_FAILED
}

export type DeploymentStatus = FailureReason | NoFailure