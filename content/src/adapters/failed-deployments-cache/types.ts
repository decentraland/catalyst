import { AuthChain } from '@dcl/crypto'
import { EntityType } from '@dcl/schemas'

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
  start(): Promise<void>
  getAllFailedDeployments(): Promise<FailedDeployment[]>
  findFailedDeployment(entityId: string): Promise<FailedDeployment | undefined>
  removeFailedDeployment(entityId: string): Promise<void>
  cacheFailedDeployment(deployment: FailedDeployment): Promise<void>
}
