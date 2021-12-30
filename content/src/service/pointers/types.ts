import { DeploymentFilters, EntityId, EntityType, Pointer, Timestamp } from 'dcl-catalyst-commons'
import { AuthChain } from 'dcl-crypto'

export type PointerChanges = Map<Pointer, { before: EntityId | undefined; after: EntityId | undefined }>

export type PointerChangesFilters = Pick<DeploymentFilters, 'from' | 'to' | 'entityTypes'>

export type DeploymentPointerChanges = {
  entityType: EntityType
  entityId: EntityId
  localTimestamp: Timestamp
  changes: PointerChanges
  authChain: AuthChain
}

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
