import { EntityId, EntityType, Timestamp } from 'dcl-catalyst-commons'
import { AuthChain } from 'dcl-crypto'
import { FailedDeploymentsRepository } from '../../repository/extensions/FailedDeploymentsRepository'

/**
 * This manager will handle all failed deployments
 */
export class FailedDeploymentsManager {
  reportFailure(
    failedDeploymentsRepo: FailedDeploymentsRepository,
    entityType: EntityType,
    entityId: EntityId,
    reason: FailureReason,
    authChain: AuthChain,
    errorDescription?: string
  ): Promise<null> {
    return failedDeploymentsRepo.reportFailure(entityType, entityId, Date.now(), reason, authChain, errorDescription)
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
  authChain: AuthChain
  errorDescription?: string
}

export enum FailureReason {
  DEPLOYMENT_ERROR = 'Deployment error' // During sync, there was an error during deployment. Could be due to a validation
}

export enum NoFailure {
  NOT_MARKED_AS_FAILED
}

export type DeploymentStatus = FailureReason | NoFailure
