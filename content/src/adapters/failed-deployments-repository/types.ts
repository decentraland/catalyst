import { DatabaseClient } from '../../adapters/database'
import { SnapshotFailedDeployment } from '../failed-deployments-cache'

export interface IFailedDeploymentsRepository {
  saveSnapshotFailedDeployment(db: DatabaseClient, failedDeployment: SnapshotFailedDeployment): Promise<void>
  deleteFailedDeployment(db: DatabaseClient, entityId: string): Promise<void>
  getSnapshotFailedDeployments(db: DatabaseClient): Promise<SnapshotFailedDeployment[]>
}
