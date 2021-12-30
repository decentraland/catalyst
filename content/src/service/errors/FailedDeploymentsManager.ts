import { EntityId, EntityType, Timestamp } from 'dcl-catalyst-commons'
import { AuthChain } from 'dcl-crypto'
import {
  findFailedDeployment,
  getAllFailedDeployments,
  reportFailure,
  reportSuccessfulDeployment
} from '../../ports/failedDeploymentsCache'

/**
 * This manager will handle all failed deployments
 */
export class FailedDeploymentsManager {
  reportFailure(
    entityType: EntityType,
    entityId: EntityId,
    reason: FailureReason,
    authChain: AuthChain,
    errorDescription?: string
  ): void {
    return reportFailure({ entityType, entityId, failureTimestamp: Date.now(), reason, authChain, errorDescription })
  }

  getAllFailedDeployments(): FailedDeployment[] {
    return getAllFailedDeployments()
  }

  reportSuccessfulDeployment(entityType: EntityType, entityId: EntityId): boolean {
    return reportSuccessfulDeployment(entityType, entityId)
  }

  getFailedDeployment(entityType: EntityType, entityId: EntityId): FailedDeployment | undefined {
    return findFailedDeployment(entityType, entityId)
  }

  async getDeploymentStatus(entityType: EntityType, entityId: EntityId): Promise<DeploymentStatus> {
    const failedDeployment = findFailedDeployment(entityType, entityId)
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
