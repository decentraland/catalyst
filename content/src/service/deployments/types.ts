// import { AuthChain } from '@dcl/crypto'
import { AuthChain, EntityType, EthAddress } from '@dcl/schemas'
import { DeploymentField } from '../../controller/Controller'
import { EntityVersion } from '../../types'

export type DeploymentFilters = {
  from?: number
  to?: number
  deployedBy?: EthAddress[]
  entityTypes?: EntityType[]
  entityIds?: string[]
  pointers?: string[]
  onlyCurrentlyPointed?: boolean
}

export enum SortingField {
  LOCAL_TIMESTAMP = 'local_timestamp',
  ENTITY_TIMESTAMP = 'entity_timestamp'
}

export enum SortingOrder {
  ASCENDING = 'ASC',
  DESCENDING = 'DESC'
}

export type DeploymentSorting = {
  field?: SortingField
  order?: SortingOrder
}

interface DeploymentRequestOptions {
  filters?: DeploymentFilters
  sortBy?: DeploymentSorting
  offset?: number
  limit?: number
  lastId?: string
}

export type PointerChangesOptions = {
  includeAuthChain?: boolean
} & DeploymentRequestOptions

export type DeploymentOptions = {
  fields?: DeploymentField[]
  includeDenylisted?: boolean
} & DeploymentRequestOptions

export type DeploymentBase = {
  entityVersion: EntityVersion
  entityType: EntityType
  entityId: string
  entityTimestamp: number
  deployedBy: EthAddress
}

export type DeploymentContent = {
  key: string
  hash: string
}

export type AuditInfo = {
  version: EntityVersion
  authChain: AuthChain
  localTimestamp: number
  overwrittenBy?: string
  isDenylisted?: boolean
  denylistedContent?: string[]
}

export type Deployment = DeploymentBase & {
  pointers: string[]
  content?: DeploymentContent[]
  metadata?: any
  auditInfo: AuditInfo
}

export type PartialDeploymentHistory<T extends DeploymentBase> = {
  deployments: T[]
  filters: DeploymentFilters
  pagination: {
    offset: number
    limit: number
    moreData: boolean
    next?: string
    lastId?: string
  }
}
