import { Deployment } from '../../deployment-types'

export interface IDeploymentsComponent {
  getDeploymentsForActiveThirdPartyItemsByEntityIds(entityIds: string[]): Promise<Deployment[]>
  updateMaterializedViews(): Promise<void>
}
