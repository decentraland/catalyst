import { EntityId, EntityType, Timestamp } from 'dcl-catalyst-commons'
import { AuthChain } from 'dcl-crypto'

export type FailedDeployment = {
  entityType: EntityType
  entityId: EntityId
  failureTimestamp: Timestamp
  reason: FailureReason
  authChain: AuthChain
  errorDescription?: string
}

export type IFailedDeploymentsCacheComponent = {
  getAllFailedDeployments(): FailedDeployment[]
  findFailedDeployment(entityId: EntityId): FailedDeployment | undefined
  reportSuccessfulDeployment(entityId: EntityId): boolean
  reportFailure(failedDeployment: FailedDeployment): void
  getDeploymentStatus(entityId: EntityId): DeploymentStatus
}

export function createFailedDeploymentsCache(): IFailedDeploymentsCacheComponent {
  const failedDeployments: Map<EntityId, FailedDeployment> = new Map()
  return {
    getAllFailedDeployments() {
      return Array.from(failedDeployments.values())
    },
    findFailedDeployment(entityId: EntityId) {
      return failedDeployments.get(entityId)
    },
    reportSuccessfulDeployment(entityId: EntityId) {
      return failedDeployments.delete(entityId)
    },
    reportFailure(failedDeployment: FailedDeployment) {
      failedDeployments.set(failedDeployment.entityId, failedDeployment)
    },
    getDeploymentStatus(entityId: EntityId) {
      return failedDeployments.get(entityId)?.reason ?? NoFailure.NOT_MARKED_AS_FAILED
    }
  }
}

export enum FailureReason {
  DEPLOYMENT_ERROR = 'Deployment error' // During sync, there was an error during deployment. Could be due to a validation
}

export enum NoFailure {
  NOT_MARKED_AS_FAILED
}

export type DeploymentStatus = FailureReason | NoFailure
