import { AuthChain } from '@dcl/crypto'
import { EntityType, PointerChangesSyncDeployment } from '@dcl/schemas'
import { Deployment, DeploymentFilters } from '../../deployment-types'
import { HistoricalDeploymentsRow } from '../../adapters/deployments-repository'
import { DeploymentId } from '../../types'

/**
 * The columns `buildHistoricalDeploymentsFromRow` reads. Declared as a `Pick<>` rather than the whole
 * `HistoricalDeploymentsRow` (or an `Omit<>` of it) so the mapper's input is closed: a column added to
 * `HistoricalDeploymentsRow` later cannot silently become a required input of a mapper that never
 * reads it, which would break callers whose source exposes only a subset of `deployments`.
 */
export type MappableDeploymentRow = Pick<
  HistoricalDeploymentsRow,
  | 'id'
  | 'entity_type'
  | 'entity_id'
  | 'entity_pointers'
  | 'entity_timestamp'
  | 'entity_metadata'
  | 'deployer_address'
  | 'version'
  | 'auth_chain'
  | 'local_timestamp'
  | 'overwritten_by'
>

/**
 * A row of `active_third_party_collection_items_deployments_with_content`, listing the view's columns
 * exactly. It is deliberately spelled out rather than derived from `HistoricalDeploymentsRow`: the
 * view renames `deployments.id` to `deployment_id`, joins in the `active_pointers` pointer, inlines
 * the deployment's content files, and selects neither `deleter_deployment` nor `overwritten_by`
 * (every row is an active, non-deleted deployment by construction). Deriving the type would promise
 * columns that never arrive, which is what let a reader key its content map by a non-existent `id`.
 * Keep this in sync with the view definition in `src/migrations/scripts`.
 */
export type ThirdPartyItemDeploymentRow = {
  pointer: string
  entity_id: string
  deployment_id: DeploymentId
  entity_type: EntityType
  entity_pointers: string[]
  entity_timestamp: number
  entity_metadata: any
  deployer_address: string
  version: string
  auth_chain: AuthChain
  local_timestamp: number
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
