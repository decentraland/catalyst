import { EntityType } from 'dcl-catalyst-commons'
import { AuthChain } from 'dcl-crypto'

export enum FailureReason {
  DEPLOYMENT_ERROR = 'Deployment error' // During sync, there was an error during deployment. Could be due to a validation
}

export enum NoFailure {
  NOT_MARKED_AS_FAILED
}

export type DeploymentStatus = FailureReason | NoFailure

export type FailedDeployment = {
  entityType: EntityType
  entityId: string
  failureTimestamp: number
  reason: FailureReason
  authChain: AuthChain
  errorDescription?: string
}

export type IFailedDeploymentsCacheComponent = {
  getAllFailedDeployments(): FailedDeployment[]
  findFailedDeployment(entityId: string): FailedDeployment | undefined
  removeFailedDeployment(entityId: string): boolean
  reportFailure(failedDeployment: FailedDeployment): void
  getDeploymentStatus(entityId: string): DeploymentStatus
}

export function createFailedDeploymentsCache(): IFailedDeploymentsCacheComponent {
  const failedDeployments: Map<string, FailedDeployment> = new Map()
  return {
    getAllFailedDeployments() {
      return Array.from(failedDeployments.values())
    },
    findFailedDeployment(entityId: string) {
      return failedDeployments.get(entityId)
    },
    removeFailedDeployment(entityId: string) {
      return failedDeployments.delete(entityId)
    },
    reportFailure(failedDeployment: FailedDeployment) {
      failedDeployments.set(failedDeployment.entityId, failedDeployment)
    },
    getDeploymentStatus(entityId: string) {
      return failedDeployments.get(entityId)?.reason ?? NoFailure.NOT_MARKED_AS_FAILED
    }
  }
}
