import { AuthChain } from '@dcl/crypto'
import { EntityType } from '@dcl/schemas'
import {
  deleteFailedDeployment,
  getFailedDeploymentByEntityId,
  getFailedDeployments,
  numberOfFailedDeployments,
  saveFailedDeployment
} from '../logic/database-queries/failed-deployments-queries'
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
  snapshotHash?: string
}

export type IFailedDeploymentsComponent = {
  getAllFailedDeployments(): Promise<FailedDeployment[]>
  findFailedDeployment(entityId: string): Promise<FailedDeployment | undefined>
  removeFailedDeployment(entityId: string): Promise<void>
  reportFailure(failedDeployment: FailedDeployment): Promise<void>
  start(): Promise<void>
}

export async function createFailedDeployments(
  components: Pick<AppComponents, 'metrics' | 'database'>
): Promise<IFailedDeploymentsComponent> {
  let failedDeploymentsCount: number
  return {
    async start() {
      failedDeploymentsCount = await numberOfFailedDeployments(components)
    },
    async getAllFailedDeployments() {
      return getFailedDeployments(components)
    },
    async findFailedDeployment(entityId: string) {
      return getFailedDeploymentByEntityId(components, entityId)
    },
    async removeFailedDeployment(entityId: string) {
      const wasDeleted = await deleteFailedDeployment(components, entityId)
      if (wasDeleted) {
        failedDeploymentsCount--
        components.metrics.observe('dcl_content_server_failed_deployments', {}, failedDeploymentsCount)
      }
    },
    async reportFailure(failedDeployment: FailedDeployment) {
      await saveFailedDeployment(components, failedDeployment)
      failedDeploymentsCount++
      components.metrics.observe('dcl_content_server_failed_deployments', {}, failedDeploymentsCount)
    }
  }
}
