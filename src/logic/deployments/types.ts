import { PointerChangesSyncDeployment } from '@dcl/schemas'
import { Deployment, DeploymentFilters } from '../../deployment-types'
import { HistoricalDeploymentsRow } from '../../adapters/deployments-repository'
import { DeploymentId } from '../../types'

/**
 * A row of `active_third_party_collection_items_deployments_with_content`. The view renames
 * `deployments.id` to `deployment_id` and inlines the deployment's content files, so it is not a
 * `HistoricalDeploymentsRow`: typing it as one silently promises an `id` column that never arrives.
 */
export type ThirdPartyItemDeploymentRow = Omit<HistoricalDeploymentsRow, 'id'> & {
  deployment_id: DeploymentId
  content_keys: string[]
  content_hashes: string[]
}

export interface IDeploymentsComponent {
  getDeploymentsForActiveThirdPartyItemsByEntityIds(entityIds: string[]): Promise<Deployment[]>
  updateMaterializedViews(): Promise<void>
}

export type PointerChangesFilters = Pick<DeploymentFilters, 'from' | 'to' | 'entityTypes'>

export type DeploymentPointerChanges = {
  pointerChanges: PointerChangesSyncDeployment[]
  filters: PointerChangesFilters
  pagination: {
    offset: number
    limit: number
    moreData: boolean
    lastId?: string
    next?: string
  }
}
