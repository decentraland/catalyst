import { AuthChain } from '@dcl/crypto'
import { EntityType } from '@dcl/schemas'
import { AppComponents } from '../types'

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

export function createFailedDeploymentsCache(
  components: Pick<AppComponents, 'metrics'>
): IFailedDeploymentsCacheComponent {
  const failedDeployments: Map<string, FailedDeployment> = new Map()
  return {
    getAllFailedDeployments() {
      return Array.from(failedDeployments.values())
    },
    findFailedDeployment(entityId: string) {
      return failedDeployments.get(entityId)
    },
    removeFailedDeployment(entityId: string) {
      const result = failedDeployments.delete(entityId)
      components.metrics.observe('dcl_content_server_failed_deployments', {}, failedDeployments.size)
      return result
    },
    reportFailure(failedDeployment: FailedDeployment) {
      const result = failedDeployments.set(failedDeployment.entityId, failedDeployment)
      components.metrics.observe('dcl_content_server_failed_deployments', {}, failedDeployments.size)
      return result
    },
    getDeploymentStatus(entityId: string) {
      return failedDeployments.get(entityId)?.reason ?? NoFailure.NOT_MARKED_AS_FAILED
    }
  }
}
