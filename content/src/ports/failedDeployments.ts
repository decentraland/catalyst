import { AuthChain } from '@dcl/crypto'
import { EntityType } from '@dcl/schemas'
import {
  deleteFailedDeployment,
  getSnapshotFailedDeployments,
  saveSnapshotFailedDeployment
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
  errorDescription: string
  snapshotHash?: string
}

export type SnapshotFailedDeployment = FailedDeployment & Required<Pick<FailedDeployment, 'snapshotHash'>>

export function isSnapshotFailedDeployment(
  failedDeployment: FailedDeployment
): failedDeployment is SnapshotFailedDeployment {
  return 'snapshotHash' in failedDeployment && typeof failedDeployment.snapshotHash == 'string'
}

export type IFailedDeploymentsComponent = {
  getAllFailedDeployments(): Promise<FailedDeployment[]>
  findFailedDeployment(entityId: string): Promise<FailedDeployment | undefined>
  removeFailedDeployment(entityId: string): Promise<void>
  reportFailure(failedDeployment: FailedDeployment): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
}

export async function createFailedDeployments(
  components: Pick<AppComponents, 'metrics' | 'database'>
): Promise<IFailedDeploymentsComponent> {
  const failedDeploymentsByEntityIdCache: Map<string, FailedDeployment> = new Map()

  return {
    async start() {
      const failedDeployments = await getSnapshotFailedDeployments(components)
      for (const failedDeployment of failedDeployments) {
        failedDeploymentsByEntityIdCache.set(failedDeployment.entityId, failedDeployment)
      }
      components.metrics.observe('dcl_content_server_failed_deployments', {}, failedDeploymentsByEntityIdCache.size)
    },
    async getAllFailedDeployments() {
      return Array.from(failedDeploymentsByEntityIdCache.values())
    },
    async findFailedDeployment(entityId: string) {
      return failedDeploymentsByEntityIdCache.get(entityId)
    },
    async removeFailedDeployment(entityId: string) {
      const failedDeployment = failedDeploymentsByEntityIdCache.get(entityId)
      if (failedDeployment) {
        await deleteFailedDeployment(components, entityId)
        failedDeploymentsByEntityIdCache.delete(entityId)
        components.metrics.observe('dcl_content_server_failed_deployments', {}, failedDeploymentsByEntityIdCache.size)
      }
    },
    async reportFailure(failedDeployment: FailedDeployment) {
      const reportedFailedDeployment = failedDeploymentsByEntityIdCache.get(failedDeployment.entityId)
      if (isSnapshotFailedDeployment(failedDeployment)) {
        // only failed deployments from snapshots are persisted
        if (reportedFailedDeployment) {
          await components.database.transaction(async (txDatabase) => {
            await deleteFailedDeployment({ database: txDatabase }, failedDeployment.entityId)
            await saveSnapshotFailedDeployment({ database: txDatabase }, failedDeployment)
          })
        } else {
          await saveSnapshotFailedDeployment(components, failedDeployment)
        }
      }
      failedDeploymentsByEntityIdCache.set(failedDeployment.entityId, failedDeployment)
      components.metrics.observe('dcl_content_server_failed_deployments', {}, failedDeploymentsByEntityIdCache.size)
    },
    async stop() {
      failedDeploymentsByEntityIdCache.clear()
    }
  }
}
