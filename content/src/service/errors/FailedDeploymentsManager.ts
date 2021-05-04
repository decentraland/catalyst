import { FailedDeploymentsRepository } from '@katalyst/content/repository/extensions/FailedDeploymentsRepository'
import { EntityId, EntityType, Timestamp } from 'dcl-catalyst-commons'

/**
 * This manager will handle all failed deployments
 */
export class FailedDeploymentsManager {
  reportFailure(
    failedDeploymentsRepo: FailedDeploymentsRepository,
    entityType: EntityType,
    entityId: EntityId,
    reason: FailureReason,
    errorDescription?: string
  ): Promise<null> {
    return failedDeploymentsRepo.reportFailure(
      entityType,
      entityId,
      Date.now(),
      reason,
      errorDescription
    )
  }

  getAllFailedDeployments(failedDeploymentsRepo: FailedDeploymentsRepository): Promise<FailedDeployment[]> {
    return failedDeploymentsRepo.getAllFailedDeployments()
  }

  reportSuccessfulDeployment(
    failedDeploymentsRepo: FailedDeploymentsRepository,
    entityType: EntityType,
    entityId: EntityId
  ): Promise<null> {
    return failedDeploymentsRepo.reportSuccessfulDeployment(entityType, entityId)
  }

  async getFailedDeployment(
    failedDeploymentsRepo: FailedDeploymentsRepository,
    entityType: EntityType,
    entityId: EntityId
  ): Promise<FailedDeployment | null> {
    return failedDeploymentsRepo.findFailedDeployment(entityType, entityId)
  }

  async getDeploymentStatus(
    failedDeploymentsRepo: FailedDeploymentsRepository,
    entityType: EntityType,
    entityId: EntityId
  ): Promise<DeploymentStatus> {
    const failedDeployment = await failedDeploymentsRepo.findFailedDeployment(entityType, entityId)
    return failedDeployment?.reason ?? NoFailure.NOT_MARKED_AS_FAILED
  }
}

export type FailedDeployment = {
  entityType: EntityType
  entityId: EntityId
  failureTimestamp: Timestamp
  reason: FailureReason
  errorDescription?: string
}

export enum FailureReason {
  NO_ENTITY_OR_AUDIT = 'No entity or audit', // During sync, we couldn't fetch the entity or the audit info
  FETCH_PROBLEM = 'Fetch problem', // During sync, we could learn the entity and the audit, but we couldn't fetch some of its files
  DEPLOYMENT_ERROR = 'Deployment error' // During sync, there was an error during deployment. Could be due to a validation
}

export enum NoFailure {
  NOT_MARKED_AS_FAILED
}

export type DeploymentStatus = FailureReason | NoFailure
