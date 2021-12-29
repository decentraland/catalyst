import { DeploymentFilters, DeploymentSorting, EntityId, EntityType, Pointer, Timestamp } from 'dcl-catalyst-commons'
import { AuthChain } from 'dcl-crypto'
import { DeploymentField } from 'src/controller/Controller'

export type PointerChanges = Map<Pointer, { before: EntityId | undefined; after: EntityId | undefined }>

export type DeploymentPointerChanges = {
  entityType: EntityType
  entityId: EntityId
  localTimestamp: Timestamp
  changes: PointerChanges
  authChain: AuthChain
}

export type PointerChangesFilters = Pick<DeploymentFilters, 'from' | 'to' | 'entityTypes'>

export type PartialDeploymentPointerChanges = {
  pointerChanges: DeploymentPointerChanges[]
  filters: Omit<PointerChangesFilters, 'entityType'>
  pagination: {
    offset: number
    limit: number
    moreData: boolean
    lastId?: string
    next?: string
  }
}

export type PointerChangesOptions = {
  filters?: DeploymentFilters
  sortBy?: DeploymentSorting
  offset?: number
  limit?: number
  lastId?: string
  includeAuthChain?: boolean
}

export type DeploymentOptions = {
  fields?: DeploymentField[]
  filters?: DeploymentFilters
  sortBy?: DeploymentSorting
  offset?: number
  limit?: number
  lastId?: string
}
