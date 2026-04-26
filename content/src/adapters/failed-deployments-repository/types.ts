import { DatabaseClient } from '../../ports/postgres'
import { SnapshotFailedDeployment } from '../../ports/failedDeployments'

export interface IFailedDeploymentsRepository {
  saveSnapshotFailedDeployment(db: DatabaseClient, failedDeployment: SnapshotFailedDeployment): Promise<void>
  deleteFailedDeployment(db: DatabaseClient, entityId: string): Promise<void>
  getSnapshotFailedDeployments(db: DatabaseClient): Promise<SnapshotFailedDeployment[]>
}
