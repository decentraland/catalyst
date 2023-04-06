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
}

export async function createFailedDeployments(
  components: Pick<AppComponents, 'metrics' | 'database' | 'denylist'>
): Promise<IFailedDeploymentsComponent> {
  const failedDeploymentsByEntityIdCache: Map<string, FailedDeployment> = new Map()

  async function start() {
    const failedDeployments = await getSnapshotFailedDeployments(components)
    for (const failedDeployment of failedDeployments) {
      failedDeploymentsByEntityIdCache.set(failedDeployment.entityId, failedDeployment)
    }
    components.metrics.observe('dcl_content_server_failed_deployments', {}, failedDeploymentsByEntityIdCache.size)
  }

  async function getAllFailedDeployments() {
    // Delete any denylisted deployment from the cache and from database
    for (const failedDeployment of failedDeploymentsByEntityIdCache.values()) {
      if (components.denylist.isDenylisted(failedDeployment.entityId)) {
        console.log('Removing denylisted deployment from failed deployments', failedDeployment.entityId)
        await removeFailedDeployment(failedDeployment.entityId)
      }
    }

    return Array.from(failedDeploymentsByEntityIdCache.values())
  }

  async function findFailedDeployment(entityId: string) {
    return failedDeploymentsByEntityIdCache.get(entityId)
  }

  async function removeFailedDeployment(entityId: string) {
    const failedDeployment = failedDeploymentsByEntityIdCache.get(entityId)
    if (failedDeployment) {
      await deleteFailedDeployment(components, entityId)
      failedDeploymentsByEntityIdCache.delete(entityId)
      components.metrics.observe('dcl_content_server_failed_deployments', {}, failedDeploymentsByEntityIdCache.size)
    }
  }

  async function reportFailure(failedDeployment: FailedDeployment) {
    const reportedFailedDeployment = failedDeploymentsByEntityIdCache.get(failedDeployment.entityId)
    if (isSnapshotFailedDeployment(failedDeployment) && !components.denylist.isDenylisted(failedDeployment.entityId)) {
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
  }

  return {
    start,
    getAllFailedDeployments,
    findFailedDeployment,
    removeFailedDeployment,
    reportFailure
  }
}
