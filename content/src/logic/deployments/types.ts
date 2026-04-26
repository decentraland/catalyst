import { PointerChangesSyncDeployment } from '@dcl/schemas'
import { Deployment, DeploymentFilters } from '../../deployment-types'

export interface IDeploymentsComponent {
  getDeploymentsForActiveThirdPartyItemsByEntityIds(entityIds: string[]): Promise<Deployment[]>
  updateMaterializedViews(): Promise<void>
}

export type PointerChangesFilters = Pick<DeploymentFilters, 'from' | 'to' | 'entityTypes'>

export type DeploymentPointerChanges = {
  pointerChanges: PointerChangesSyncDeployment[]
  filters: Omit<PointerChangesFilters, 'entityType'>
  pagination: {
    offset: number
    limit: number
    moreData: boolean
    lastId?: string
    next?: string
  }
}
